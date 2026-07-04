import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * A1 — Push Google CIBLÉ depuis les webhooks POS (les 4 routes).
 *
 * Avant : chaque vente déclenchait `pushInventoryToGoogle(merchant_id)` SANS
 * `productIds` → re-push du CATALOGUE ENTIER à chaque événement (gaspillage quota
 * API Google, latence), alors que le(s) produit(s) touché(s) étaient connus dans
 * la boucle (via `resolveWebhookProduct`).
 *
 * Contrat verrouillé ici, paramétré sur les 4 routes (delta : shopify/lightspeed ;
 * absolu : square/zettle) :
 *  1. `pushInventoryToGoogle` reçoit (merchant_id, [ids touchés]) — JAMAIS un appel
 *     global sans ids.
 *  2. Plusieurs updates → tous les ids touchés dans le même appel (1 push, pas N).
 *  3. Aucun produit résolu (non suivi) → AUCUN push (rien n'a changé côté stock).
 *  4. Collision multi-marchands (2 updates → 2 marchands) → un push par marchand,
 *     chacun avec SES ids (l'ancien code ne poussait que le marchand du 1er update).
 *  5. Le merchant_id vient de `resolveWebhookProduct` (le re-lookup par pos_item_id
 *     est supprimé) — prouvé par l'absence de tout `maybeSingle` produits.
 */

const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureMock(...a) }));

const updateStockAtomic = vi.fn(async () => 5);
vi.mock("@/lib/pos/update-stock", () => ({ updateStockAtomic: (...a: unknown[]) => updateStockAtomic(...a) }));

// Résolution par pos_item_id → produit (configurable par test)
let resolveMap: Record<string, { id: string; merchant_id: string } | null>;
const resolveWebhookProduct = vi.fn(async (_sb: unknown, posItemId: string) => resolveMap[posItemId] ?? null);
vi.mock("@/lib/pos/resolve-product", () => ({
    resolveWebhookProduct: (...a: unknown[]) => resolveWebhookProduct(...(a as [unknown, string, string])),
}));

const recalc = vi.fn(async () => {});
vi.mock("@/lib/pos/recalculate-sizes", () => ({ recalculateGroupSizesAdmin: (...a: unknown[]) => recalc(...a) }));

const pushGoogle = vi.fn(async () => {});
vi.mock("@/lib/google/inventory", () => ({ pushInventoryToGoogle: (...a: unknown[]) => pushGoogle(...a) }));

const notifyFav = vi.fn(async () => {});
vi.mock("@/lib/push-send", () => ({ notifyProductFavorites: (...a: unknown[]) => notifyFav(...a) }));

// ─── Adapters mockés ──────────────────────────────────────────────────────────
const shopifyVerify = vi.fn(() => true);
const shopifyParse = vi.fn();
vi.mock("@/lib/pos/shopify", () => ({
    shopifyAdapter: { verifyWebhook: (...a: unknown[]) => shopifyVerify(...a), parseWebhookEvent: (...a: unknown[]) => shopifyParse(...a) },
}));
const lsVerify = vi.fn(() => true);
const lsParse = vi.fn();
vi.mock("@/lib/pos/lightspeed", () => ({
    lightspeedAdapter: { verifyWebhook: (...a: unknown[]) => lsVerify(...a), parseWebhookEvent: (...a: unknown[]) => lsParse(...a) },
}));
const squareVerify = vi.fn(() => true);
const squareParse = vi.fn();
vi.mock("@/lib/pos/square", () => ({
    squareAdapter: { verifyWebhook: (...a: unknown[]) => squareVerify(...a), parseWebhookEvent: (...a: unknown[]) => squareParse(...a) },
}));
const zettleVerify = vi.fn(() => true);
const zettleParse = vi.fn();
vi.mock("@/lib/pos/zettle", () => ({
    zettleAdapter: { verifyWebhook: (...a: unknown[]) => zettleVerify(...a), parseWebhookEvent: (...a: unknown[]) => zettleParse(...a) },
}));

// ─── Faux client admin ; trace le re-lookup produits (doit avoir DISPARU) ─────
let productMerchantLookups: number;
vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from: (table: string) => {
            if (table === "webhook_events") {
                return {
                    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
                    insert: async () => ({ error: null }),
                };
            }
            if (table === "feed_events") {
                return { insert: async () => ({ error: null }) };
            }
            if (table === "products") {
                return {
                    select: (cols: string) => ({
                        eq: () => ({
                            single: async () => ({ data: { name: "Sneaker X" }, error: null }),
                            maybeSingle: async () => {
                                // L'ancien chemin "merchant-lookup-google" (select merchant_id
                                // par pos_item_id) — s'il est encore appelé, c'est une régression.
                                if (cols.includes("merchant_id")) productMerchantLookups++;
                                return { data: null, error: null };
                            },
                        }),
                    }),
                };
            }
            return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
        },
    }),
}));

import { POST as shopifyPOST } from "@/app/api/webhooks/shopify/route";
import { POST as lightspeedPOST } from "@/app/api/webhooks/lightspeed/route";
import { POST as squarePOST } from "@/app/api/webhooks/square/route";
import { POST as zettlePOST } from "@/app/api/webhooks/zettle/route";

const EVENT_TS = "2026-07-04T10:00:00Z";

interface ProviderCase {
    name: string;
    POST: (req: NextRequest) => Promise<Response>;
    parse: ReturnType<typeof vi.fn>;
    sigHeader: string;
    /** delta (vente = -n) ou absolu (état = n) — sans incidence sur le contrat Google. */
    qty: number;
}

const PROVIDERS: ProviderCase[] = [
    { name: "shopify", POST: shopifyPOST, parse: shopifyParse, sigHeader: "x-shopify-hmac-sha256", qty: -2 },
    { name: "lightspeed", POST: lightspeedPOST, parse: lsParse, sigHeader: "x-lightspeed-signature", qty: -2 },
    { name: "square", POST: squarePOST, parse: squareParse, sigHeader: "x-square-hmacsha256-signature", qty: 8 },
    { name: "zettle", POST: zettlePOST, parse: zettleParse, sigHeader: "x-izettle-signature", qty: 8 },
];

function makeReq(p: ProviderCase): NextRequest {
    const headers = new Headers();
    headers.set(p.sigHeader, "valid-sig");
    // Les routes delta lisent aussi l'id d'idempotence ; inoffensif pour les absolues.
    headers.set("x-shopify-webhook-id", "wh-1");
    headers.set("x-lightspeed-event-id", "wh-1");
    return new NextRequest(`http://localhost/api/webhooks/${p.name}`, { method: "POST", body: "{}", headers });
}

beforeEach(() => {
    vi.clearAllMocks();
    updateStockAtomic.mockResolvedValue(5);
    shopifyVerify.mockReturnValue(true);
    lsVerify.mockReturnValue(true);
    squareVerify.mockReturnValue(true);
    zettleVerify.mockReturnValue(true);
    resolveMap = { "item-1": { id: "prod-1", merchant_id: "merch-1" } };
    productMerchantLookups = 0;
});

describe.each(PROVIDERS)("push Google CIBLÉ — $name", (p) => {
    it("1 update → pushInventoryToGoogle(merchant, [id touché]) — PAS d'appel global sans ids", async () => {
        p.parse.mockReturnValue([{ pos_item_id: "item-1", quantity: p.qty, updated_at: EVENT_TS }]);
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(200);
        expect(pushGoogle).toHaveBeenCalledTimes(1);
        expect(pushGoogle).toHaveBeenCalledWith("merch-1", ["prod-1"]);
        // L'appel global d'avant (2e arg undefined) est une régression quota.
        expect(pushGoogle.mock.calls[0][1]).toBeDefined();
        // Le re-lookup merchant_id par pos_item_id a été SUPPRIMÉ (merchant_id vient
        // de resolveWebhookProduct).
        expect(productMerchantLookups).toBe(0);
    });

    it("2 updates même marchand → UN push avec les DEUX ids touchés", async () => {
        resolveMap = {
            "item-1": { id: "prod-1", merchant_id: "merch-1" },
            "item-2": { id: "prod-2", merchant_id: "merch-1" },
        };
        p.parse.mockReturnValue([
            { pos_item_id: "item-1", quantity: p.qty, updated_at: EVENT_TS },
            { pos_item_id: "item-2", quantity: p.qty, updated_at: EVENT_TS },
        ]);
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(200);
        expect(pushGoogle).toHaveBeenCalledTimes(1);
        expect(pushGoogle).toHaveBeenCalledWith("merch-1", ["prod-1", "prod-2"]);
    });

    it("aucun produit résolu (non suivi) → AUCUN push Google (rien n'a changé)", async () => {
        resolveMap = {};
        p.parse.mockReturnValue([{ pos_item_id: "unknown-item", quantity: p.qty, updated_at: EVENT_TS }]);
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(200);
        expect(updateStockAtomic).not.toHaveBeenCalled();
        expect(pushGoogle).not.toHaveBeenCalled();
    });

    it("updates → 2 marchands distincts → un push PAR marchand avec SES ids", async () => {
        resolveMap = {
            "item-1": { id: "prod-a", merchant_id: "merch-1" },
            "item-2": { id: "prod-b", merchant_id: "merch-2" },
        };
        p.parse.mockReturnValue([
            { pos_item_id: "item-1", quantity: p.qty, updated_at: EVENT_TS },
            { pos_item_id: "item-2", quantity: p.qty, updated_at: EVENT_TS },
        ]);
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(200);
        expect(pushGoogle).toHaveBeenCalledTimes(2);
        expect(pushGoogle).toHaveBeenCalledWith("merch-1", ["prod-a"]);
        expect(pushGoogle).toHaveBeenCalledWith("merch-2", ["prod-b"]);
    });

    it("mix résolu/non-résolu → seuls les ids RÉELLEMENT touchés partent", async () => {
        resolveMap = { "item-1": { id: "prod-1", merchant_id: "merch-1" } };
        p.parse.mockReturnValue([
            { pos_item_id: "item-1", quantity: p.qty, updated_at: EVENT_TS },
            { pos_item_id: "untracked", quantity: p.qty, updated_at: EVENT_TS },
        ]);
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(200);
        expect(pushGoogle).toHaveBeenCalledTimes(1);
        expect(pushGoogle).toHaveBeenCalledWith("merch-1", ["prod-1"]);
    });
});
