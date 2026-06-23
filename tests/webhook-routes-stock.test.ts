import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * HOT PATH temps réel — route handlers webhook POS (`POST /api/webhooks/{shopify,lightspeed}`).
 *
 * North-star §1 pilier 2 : « afficher le stock en QUASI TEMPS RÉEL, honnêtement ». Le webhook
 * est LE canal temps réel. Ses UNITÉS étaient testées (`parseWebhookEvent`, `resolveWebhookProduct`)
 * mais AUCUN test ne drivait le route handler de bout en bout — or c'est lui qui orchestre le
 * contrat critique : signature → idempotence → résolution → `updateStockAtomic` (delta) → recalc →
 * Google. Cette suite verrouille ce contrat sur les DEUX jumeaux delta (Shopify + Lightspeed) :
 *
 *  1. Signature invalide → 401, ZÉRO effet de bord (pas de write stock, pas d'insert idempotence).
 *  2. Idempotence : doublon (`webhook_id` déjà vu) → `{skipped:"duplicate"}`, ZÉRO décrément
 *     (sinon double-décrément de la vente = perte/faux stock).
 *  3. Idempotence : erreur de lecture/insert NON avalée → 500 (le POS retente), captureError.
 *  4. Happy path : `updateStockAtomic` reçoit (productId, qty, "delta", "webhook", source_ts=heure
 *     de l'événement) — prouve que la SOURCE et la FRAÎCHEUR réelles sont bien câblées (cf. le bug
 *     de garde cosmétique du parser Shopify corrigé en parallèle).
 *  5. `resolveWebhookProduct` → null (produit non suivi) → skip, pas de write, 200.
 *  6. Traitement qui throw (DB down) → 500 + captureError, JAMAIS un 200 silencieux.
 *  7. Sans `webhook_id` → idempotence sautée mais traitement effectué.
 */

const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureMock(...a) }));

const updateStockAtomic = vi.fn(async () => 5);
vi.mock("@/lib/pos/update-stock", () => ({ updateStockAtomic: (...a: unknown[]) => updateStockAtomic(...a) }));

const resolveWebhookProduct = vi.fn(async () => ({ id: "prod-1", merchant_id: "merch-1" }));
vi.mock("@/lib/pos/resolve-product", () => ({ resolveWebhookProduct: (...a: unknown[]) => resolveWebhookProduct(...a) }));

const recalc = vi.fn(async () => {});
vi.mock("@/lib/pos/recalculate-sizes", () => ({ recalculateGroupSizesAdmin: (...a: unknown[]) => recalc(...a) }));

const pushGoogle = vi.fn(async () => {});
vi.mock("@/lib/google/inventory", () => ({ pushInventoryToGoogle: (...a: unknown[]) => pushGoogle(...a) }));

const notifyFav = vi.fn(async () => {});
vi.mock("@/lib/push-send", () => ({ notifyProductFavorites: (...a: unknown[]) => notifyFav(...a) }));

// ─── Adapters mockés (on contrôle verifyWebhook + parseWebhookEvent) ─────────
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

// ─── Faux client admin (webhook_events idempotence + feed_events + products) ─
interface AdminCfg {
    webhookExisting: { id: string } | null;
    webhookCheckErr: unknown;
    webhookInsertErr: unknown;
    productName: string | null;
    googleMerchant: { merchant_id: string } | null;
}
let cfg: AdminCfg;
let webhookInserts: Array<Record<string, unknown>>;
let feedInserts: Array<Record<string, unknown>>;

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from: (table: string) => {
            if (table === "webhook_events") {
                return {
                    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cfg.webhookExisting, error: cfg.webhookCheckErr }) }) }),
                    insert: async (row: Record<string, unknown>) => {
                        webhookInserts.push(row);
                        return { error: cfg.webhookInsertErr };
                    },
                };
            }
            if (table === "feed_events") {
                return {
                    insert: async (row: Record<string, unknown>) => {
                        feedInserts.push(row);
                        return { error: null };
                    },
                };
            }
            if (table === "products") {
                return {
                    select: (cols: string) => ({
                        eq: () =>
                            cols.includes("name")
                                ? { single: async () => ({ data: cfg.productName ? { name: cfg.productName } : null, error: null }) }
                                : { maybeSingle: async () => ({ data: cfg.googleMerchant, error: null }) },
                    }),
                };
            }
            return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
        },
    }),
}));

import { POST as shopifyPOST } from "@/app/api/webhooks/shopify/route";
import { POST as lightspeedPOST } from "@/app/api/webhooks/lightspeed/route";

const EVENT_TS = "2026-06-19T10:00:00Z";

interface ProviderCase {
    name: string;
    POST: (req: NextRequest) => Promise<Response>;
    verify: ReturnType<typeof vi.fn>;
    parse: ReturnType<typeof vi.fn>;
    sigHeader: string;
    idHeader: string;
}

const PROVIDERS: ProviderCase[] = [
    { name: "shopify", POST: shopifyPOST, verify: shopifyVerify, parse: shopifyParse, sigHeader: "x-shopify-hmac-sha256", idHeader: "x-shopify-webhook-id" },
    { name: "lightspeed", POST: lightspeedPOST, verify: lsVerify, parse: lsParse, sigHeader: "x-lightspeed-signature", idHeader: "x-lightspeed-event-id" },
];

function makeReq(p: ProviderCase, opts: { sig?: string | null; id?: string | null; body?: string } = {}): NextRequest {
    const { sig = "valid-sig", id = "wh-1", body = "{}" } = opts;
    const headers = new Headers();
    if (sig !== null) headers.set(p.sigHeader, sig);
    if (id !== null) headers.set(p.idHeader, id);
    return new NextRequest(`http://localhost/api/webhooks/${p.name}`, { method: "POST", body, headers });
}

beforeEach(() => {
    vi.clearAllMocks();
    updateStockAtomic.mockResolvedValue(5);
    resolveWebhookProduct.mockResolvedValue({ id: "prod-1", merchant_id: "merch-1" });
    shopifyVerify.mockReturnValue(true);
    lsVerify.mockReturnValue(true);
    // Un décrément de vente avec l'horodatage RÉEL de l'événement
    const updates = [{ pos_item_id: "v-1", quantity: -2, updated_at: EVENT_TS }];
    shopifyParse.mockReturnValue(updates);
    lsParse.mockReturnValue(updates);
    cfg = { webhookExisting: null, webhookCheckErr: null, webhookInsertErr: null, productName: "Sneaker X", googleMerchant: { merchant_id: "merch-1" } };
    webhookInserts = [];
    feedInserts = [];
});

describe.each(PROVIDERS)("webhook route stock contract — $name", (p) => {
    it("signature invalide → 401, ZÉRO effet de bord", async () => {
        p.verify.mockReturnValue(false);
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(401);
        expect(updateStockAtomic).not.toHaveBeenCalled();
        expect(webhookInserts).toHaveLength(0);
    });

    it("doublon (webhook_id déjà vu) → skip, ZÉRO décrément", async () => {
        cfg.webhookExisting = { id: "existing" };
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ skipped: "duplicate" });
        expect(updateStockAtomic).not.toHaveBeenCalled();
    });

    it("erreur de lecture d'idempotence NON avalée → 500 + captureError, ZÉRO décrément", async () => {
        cfg.webhookCheckErr = { message: "db blip" };
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(500);
        expect(captureMock).toHaveBeenCalled();
        expect(updateStockAtomic).not.toHaveBeenCalled();
    });

    it("erreur d'insert d'idempotence NON avalée → 500 + captureError", async () => {
        cfg.webhookInsertErr = { message: "insert failed" };
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(500);
        expect(captureMock).toHaveBeenCalled();
        expect(updateStockAtomic).not.toHaveBeenCalled();
    });

    it("happy path → updateStockAtomic en mode delta, source 'webhook', source_ts = heure de l'événement", async () => {
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(200);
        expect(updateStockAtomic).toHaveBeenCalledTimes(1);
        // (supabase, productId, quantity, mode, source, sourceTs)
        const call = updateStockAtomic.mock.calls[0];
        expect(call[1]).toBe("prod-1");
        expect(call[2]).toBe(-2);
        expect(call[3]).toBe("delta");
        expect(call[4]).toBe("webhook");
        expect(call[5]).toBe(EVENT_TS); // fraîcheur honnête, pas l'heure de réception
        expect(recalc).toHaveBeenCalledWith("prod-1");
        expect(feedInserts).toHaveLength(1);
        expect(feedInserts[0]).toMatchObject({ merchant_id: "merch-1", product_id: "prod-1", event_type: "sale" });
    });

    it("produit non suivi (resolve → null) → skip sans write, 200", async () => {
        resolveWebhookProduct.mockResolvedValue(null);
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(200);
        expect(updateStockAtomic).not.toHaveBeenCalled();
        expect(feedInserts).toHaveLength(0);
    });

    it("traitement qui throw (DB down) → 500 + captureError, jamais un 200 silencieux", async () => {
        updateStockAtomic.mockRejectedValue(new Error("stock RPC down"));
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(500);
        expect(captureMock).toHaveBeenCalled();
    });

    it("résolution produit qui throw (blip DB) → 500 + captureError (≠ produit non suivi)", async () => {
        // resolveWebhookProduct LÈVE sur erreur DB (≠ null = non suivi) → catch route → 500
        // → le POS retente → MAJ stock temps réel récupérée. Verrouille la distinction throw/null.
        resolveWebhookProduct.mockRejectedValue(new Error("resolve db error"));
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(500);
        expect(captureMock).toHaveBeenCalled();
        expect(updateStockAtomic).not.toHaveBeenCalled();
    });

    it("recalc des tailles qui throw → 200 (stock déjà committé) + captureError, PAS de 500 (sinon idempotence-skip au retry)", async () => {
        // Le stock autoritaire est committé avant recalc ; un throw recalc ne doit PAS faire 500
        // (retry → webhook_id déjà vu → skip → recalc jamais rejoué). captureError + on continue.
        recalc.mockRejectedValue(new Error("recalc db crash"));
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(200);
        expect(updateStockAtomic).toHaveBeenCalledTimes(1); // le décrément a bien eu lieu
        expect(captureMock).toHaveBeenCalled();
    });

    it("JSON invalide AVEC webhook_id → 400, mais l'idempotence a bien été insérée AVANT le parse", async () => {
        const res = await p.POST(makeReq(p, { body: "not json" }));
        expect(res.status).toBe(400);
        expect(webhookInserts).toHaveLength(1); // l'ordre idempotence→parse est verrouillé
        expect(updateStockAtomic).not.toHaveBeenCalled();
    });

    it("sans webhook_id → idempotence sautée mais traitement effectué", async () => {
        const res = await p.POST(makeReq(p, { id: null }));
        expect(res.status).toBe(200);
        expect(webhookInserts).toHaveLength(0);
        expect(updateStockAtomic).toHaveBeenCalledTimes(1);
    });

    it("JSON invalide (sans webhook_id) → 400, pas de write", async () => {
        const res = await p.POST(makeReq(p, { id: null, body: "not json" }));
        expect(res.status).toBe(400);
        expect(updateStockAtomic).not.toHaveBeenCalled();
    });
});
