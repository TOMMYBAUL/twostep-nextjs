import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * HOT PATH temps réel — route handlers webhook POS en mode ABSOLU (`POST /api/webhooks/{square,zettle}`).
 *
 * North-star §1 pilier 2 : « afficher le stock en QUASI TEMPS RÉEL, honnêtement ». Le webhook
 * est LE canal temps réel. Les jumeaux DELTA (Shopify/Lightspeed) sont verrouillés par
 * `webhook-routes-stock.test.ts` ; ce fichier verrouille les jumeaux ABSOLUS (Square/Zettle),
 * dont la sémantique diffère :
 *  - `updateStockAtomic(..., "absolute", ...)` (la quantité est l'état absolu, pas un delta) ;
 *  - PAS d'idempotence `webhook_events` (le ré-envoi ré-applique le même absolu = idempotent
 *    naturellement) → le contrat doit prouver qu'aucun insert d'idempotence n'est tenté ;
 *  - le `source_ts` transmis = horodatage RÉEL de l'événement (Square `calculated_at`,
 *    Zettle `event.timestamp`) → active la garde anti-régression de la 104 (out-of-order).
 *
 * Contrat verrouillé sur les DEUX jumeaux (signature → résolution → updateStockAtomic absolu →
 * recalc → Google), plus les sémantiques de feed_event propres à chaque provider.
 */

const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureMock(...a) }));

// Contrat post-110 : {previous, written}. `written=true` = le stock a changé (nominal).
const updateStockAtomic = vi.fn(async () => ({ previous: 5, written: true }));
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

// ─── Faux client admin (feed_events + products ; webhook_events tracé pour prouver son ABSENCE) ─
interface AdminCfg {
    productName: string | null;
    googleMerchant: { merchant_id: string } | null;
}
let cfg: AdminCfg;
let feedInserts: Array<Record<string, unknown>>;
let webhookEventsTouched: boolean;

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from: (table: string) => {
            if (table === "webhook_events") {
                // Mode absolu = AUCUNE idempotence : si la route touchait cette table ce serait une régression.
                webhookEventsTouched = true;
                return {
                    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
                    insert: async () => ({ error: null }),
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

import { POST as squarePOST } from "@/app/api/webhooks/square/route";
import { POST as zettlePOST } from "@/app/api/webhooks/zettle/route";

const EVENT_TS = "2026-06-19T10:00:00Z";

interface ProviderCase {
    name: string;
    POST: (req: NextRequest) => Promise<Response>;
    verify: ReturnType<typeof vi.fn>;
    parse: ReturnType<typeof vi.fn>;
    sigHeader: string;
}

const PROVIDERS: ProviderCase[] = [
    { name: "square", POST: squarePOST, verify: squareVerify, parse: squareParse, sigHeader: "x-square-hmacsha256-signature" },
    { name: "zettle", POST: zettlePOST, verify: zettleVerify, parse: zettleParse, sigHeader: "x-izettle-signature" },
];

function makeReq(p: ProviderCase, opts: { sig?: string | null; body?: string } = {}): NextRequest {
    const { sig = "valid-sig", body = "{}" } = opts;
    const headers = new Headers();
    if (sig !== null) headers.set(p.sigHeader, sig);
    return new NextRequest(`http://localhost/api/webhooks/${p.name}`, { method: "POST", body, headers });
}

beforeEach(() => {
    vi.clearAllMocks();
    updateStockAtomic.mockResolvedValue(5); // previousQty = 5
    resolveWebhookProduct.mockResolvedValue({ id: "prod-1", merchant_id: "merch-1" });
    squareVerify.mockReturnValue(true);
    zettleVerify.mockReturnValue(true);
    // Mode ABSOLU : quantity = état absolu (8 unités), pas un delta. source_ts = heure RÉELLE.
    const updates = [{ pos_item_id: "v-1", quantity: 8, updated_at: EVENT_TS }];
    squareParse.mockReturnValue(updates);
    zettleParse.mockReturnValue(updates);
    cfg = { productName: "Sneaker X", googleMerchant: { merchant_id: "merch-1" } };
    feedInserts = [];
    webhookEventsTouched = false;
});

describe.each(PROVIDERS)("webhook route stock contract (ABSOLU) — $name", (p) => {
    it("signature invalide → 403, ZÉRO effet de bord", async () => {
        p.verify.mockReturnValue(false);
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(403);
        expect(updateStockAtomic).not.toHaveBeenCalled();
        expect(feedInserts).toHaveLength(0);
    });

    it("JSON invalide → 400, pas de write", async () => {
        const res = await p.POST(makeReq(p, { body: "not json" }));
        expect(res.status).toBe(400);
        expect(updateStockAtomic).not.toHaveBeenCalled();
    });

    it("type d'événement non géré (parse → null) → 200, pas de write", async () => {
        p.parse.mockReturnValue(null);
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(200);
        expect(updateStockAtomic).not.toHaveBeenCalled();
        expect(feedInserts).toHaveLength(0);
    });

    it("parse → tableau vide → 200, pas de write", async () => {
        p.parse.mockReturnValue([]);
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(200);
        expect(updateStockAtomic).not.toHaveBeenCalled();
    });

    it("happy path → updateStockAtomic en mode ABSOLU, source 'webhook', source_ts = heure de l'événement", async () => {
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(200);
        expect(updateStockAtomic).toHaveBeenCalledTimes(1);
        // (supabase, productId, quantity, mode, source, sourceTs)
        const call = updateStockAtomic.mock.calls[0];
        expect(call[1]).toBe("prod-1");
        expect(call[2]).toBe(8); // état ABSOLU, pas un delta
        expect(call[3]).toBe("absolute");
        expect(call[4]).toBe("webhook");
        expect(call[5]).toBe(EVENT_TS); // fraîcheur honnête (calculated_at/timestamp), pas l'heure de réception
        expect(recalc).toHaveBeenCalledWith("prod-1");
    });

    it("PAS d'idempotence webhook_events en mode absolu (le ré-envoi ré-applique l'absolu)", async () => {
        await p.POST(makeReq(p));
        expect(webhookEventsTouched).toBe(false);
    });

    it("produit non suivi (resolve → null) → skip sans write, 200", async () => {
        resolveWebhookProduct.mockResolvedValue(null);
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(200);
        expect(updateStockAtomic).not.toHaveBeenCalled();
        expect(feedInserts).toHaveLength(0);
    });

    it("résolution produit qui throw (blip DB) → 500 + captureError (≠ produit non suivi)", async () => {
        resolveWebhookProduct.mockRejectedValue(new Error("resolve db error"));
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(500);
        expect(captureMock).toHaveBeenCalled();
        expect(updateStockAtomic).not.toHaveBeenCalled();
    });

    it("updateStockAtomic qui throw (RPC down) → 500 + captureError, jamais un 200 silencieux", async () => {
        updateStockAtomic.mockRejectedValue(new Error("stock RPC down"));
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(500);
        expect(captureMock).toHaveBeenCalled();
    });

    it("recalc des tailles qui throw → 200 (stock absolu déjà committé) + captureError, PAS de 500", async () => {
        // Le stock absolu est committé avant recalc ; recalc = métadonnée d'affichage dérivée.
        // Un throw recalc ne doit PAS faire 500 (échec d'affichage ≠ échec du canal stock + retry
        // POS inutile). captureError + on continue (cohérent avec les jumeaux delta).
        recalc.mockRejectedValue(new Error("recalc db crash"));
        const res = await p.POST(makeReq(p));
        expect(res.status).toBe(200);
        expect(updateStockAtomic).toHaveBeenCalledTimes(1); // l'écriture stock a bien eu lieu
        expect(captureMock).toHaveBeenCalled();
    });
});

// ─── Sémantiques de feed_event propres à chaque provider (divergentes) ────────
describe("feed_event — sémantique Square (restock UNIQUEMENT sur 0→positif)", () => {
    it("retour en stock (previousQty 0 → quantity 8) → feed_event 'restock' + notify", async () => {
        updateStockAtomic.mockResolvedValue({ previous: 0, written: true }); // était à 0
        squareParse.mockReturnValue([{ pos_item_id: "v-1", quantity: 8, updated_at: EVENT_TS }]);
        const res = await squarePOST(makeReq(PROVIDERS[0]));
        expect(res.status).toBe(200);
        expect(feedInserts).toHaveLength(1);
        expect(feedInserts[0]).toMatchObject({ merchant_id: "merch-1", product_id: "prod-1", event_type: "restock" });
        expect(notifyFav).toHaveBeenCalledTimes(1);
    });

    it("vente (previousQty 5 → quantity 3) → AUCUN feed_event (Square n'émet pas de 'sale')", async () => {
        updateStockAtomic.mockResolvedValue({ previous: 5, written: true });
        squareParse.mockReturnValue([{ pos_item_id: "v-1", quantity: 3, updated_at: EVENT_TS }]);
        const res = await squarePOST(makeReq(PROVIDERS[0]));
        expect(res.status).toBe(200);
        expect(feedInserts).toHaveLength(0);
        expect(notifyFav).not.toHaveBeenCalled();
    });
});

describe("feed_event — sémantique Zettle (toujours émis : restock si qty monte, sinon sale)", () => {
    it("vente (previousQty 5 → quantity 3) → feed_event 'sale', pas de notify", async () => {
        updateStockAtomic.mockResolvedValue({ previous: 5, written: true });
        zettleParse.mockReturnValue([{ pos_item_id: "v-1", quantity: 3, updated_at: EVENT_TS }]);
        const res = await zettlePOST(makeReq(PROVIDERS[1]));
        expect(res.status).toBe(200);
        expect(feedInserts).toHaveLength(1);
        expect(feedInserts[0]).toMatchObject({ event_type: "sale" });
        expect(notifyFav).not.toHaveBeenCalled();
    });

    it("retour en stock (previousQty 0 → quantity 8) → feed_event 'restock' + notify", async () => {
        updateStockAtomic.mockResolvedValue({ previous: 0, written: true });
        zettleParse.mockReturnValue([{ pos_item_id: "v-1", quantity: 8, updated_at: EVENT_TS }]);
        const res = await zettlePOST(makeReq(PROVIDERS[1]));
        expect(res.status).toBe(200);
        expect(feedInserts).toHaveLength(1);
        expect(feedInserts[0]).toMatchObject({ event_type: "restock" });
        expect(notifyFav).toHaveBeenCalledTimes(1);
    });
});

// ─── P0-6 : absolu PÉRIMÉ rejeté par la garde temporelle 104 (written=false) ────
// LE cas central : DB fraîche = épuisé (previous 0), mais un webhook LIVRÉ EN RETARD annonce
// un stock positif (quantity 8) avec un source_ts ANCIEN → la RPC rejette l'écriture (le stock
// reste 0) et renvoie written=false. Sans le garde, la route voyait previous===0 && quantity>0
// → émettait un « restock » MENSONGER + notifiait « de retour en stock » les favoris sur un
// produit RÉELLEMENT épuisé. On prouve les DEUX jumeaux absolus.
describe.each([
    { name: "square", POST: squarePOST, parse: squareParse, provider: PROVIDERS[0] },
    { name: "zettle", POST: zettlePOST, parse: zettleParse, provider: PROVIDERS[1] },
])("P0-6 — feed_event/notif fantôme sur absolu périmé rejeté ($name)", (c) => {
    it("stale-reject (written:false, previous 0, événement périmé qty 8) → AUCUN restock, AUCUNE notif", async () => {
        updateStockAtomic.mockResolvedValue({ previous: 0, written: false });
        c.parse.mockReturnValue([{ pos_item_id: "v-1", quantity: 8, updated_at: EVENT_TS }]);
        const res = await c.POST(makeReq(c.provider));
        expect(res.status).toBe(200);
        expect(updateStockAtomic).toHaveBeenCalledTimes(1); // la RPC a bien tranché
        expect(feedInserts).toHaveLength(0); // pas de « restock » mensonger
        expect(notifyFav).not.toHaveBeenCalled(); // pas de spam « de retour en stock »
    });
});
