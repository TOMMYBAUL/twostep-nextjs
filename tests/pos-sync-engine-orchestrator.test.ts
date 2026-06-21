import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Couverture de CONTRAT de l'orchestrateur `syncMerchantPOS` (le dernier gros hot path
 * du sync POS catalogue dont l'orchestration end-to-end n'était pas testée). Les WRITES
 * unitaires (applyStockUpserts / hideOrphanProducts / groupVariantsByEAN / updateProduct /
 * upsertPromo) sont déjà couverts ; ici on VERROUILLE le câblage d'ensemble = l'invariant
 * north-star « ne rien perdre sans alerte » au niveau de l'orchestrateur :
 *
 *  1. Un échec APRÈS acquisition du lock (token, lecture connexion, fetch adaptateur, write)
 *     est TOUJOURS converti en `pos_connections.last_sync_status = "error"` (+ `last_sync_error`,
 *     `syncing_since` libéré) PUIS remonté (`captureError`) PUIS RE-LEVÉ — jamais avalé en
 *     « success » avec un stock périmé (le faux positif n°1 : un vendu affiché « en stock »).
 *  2. Un hoquet POS transitoire (`getCatalog` qui jette) ne déclenche NI réconciliation
 *     (masquage orphelins) NI bookkeeping « success » → jamais de catalogue fantôme effacé.
 *  3. Le lock occupé par un autre sync → retour all-zeros SANS toucher au token, à l'adaptateur,
 *     ni à aucune écriture (skip de concurrence sûr, pas une perte).
 *  4. Le chemin nominal (catalogue vide) pose bien `last_sync_status = "success"`,
 *     `last_sync_error = null`, sans jamais appeler `captureError`.
 *
 * Toutes les dépendances réseau/DB sont mockées (« gros mock adaptateur » mentionné au worklog).
 */

const h = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    adapter: { getCatalog: vi.fn(), getStock: vi.fn(), fetchPromos: vi.fn() },
    ensureFreshAccessToken: vi.fn(),
    captureError: vi.fn(),
    pushInventoryToGoogle: vi.fn(),
    categorizeMerchantProducts: vi.fn(),
    createImageJob: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: () => h.createClientMock() }));
vi.mock("@/lib/pos", () => ({ getAdapter: () => h.adapter }));
vi.mock("@/lib/pos/access-token", () => ({
    ensureFreshAccessToken: (...a: unknown[]) => h.ensureFreshAccessToken(...a),
}));
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => h.captureError(...a) }));
vi.mock("@/lib/google/inventory", () => ({ pushInventoryToGoogle: (...a: unknown[]) => h.pushInventoryToGoogle(...a) }));
vi.mock("@/lib/ai/categorize", () => ({ categorizeMerchantProducts: (...a: unknown[]) => h.categorizeMerchantProducts(...a) }));
vi.mock("@/lib/images/jobs", () => ({ createImageJob: (...a: unknown[]) => h.createImageJob(...a) }));
vi.mock("@/lib/pos/extract-size", () => ({ resolveProductSize: () => null }));
// Imports dynamiques (await import) côté orchestrateur — interceptés aussi.
vi.mock("@/lib/enrichment/match-product", () => ({
    buildProductIndex: vi.fn(async () => ({ all: [], byPosItemId: new Map(), byEan: new Map() })),
    matchProduct: vi.fn(() => null),
}));
vi.mock("@/lib/enrichment/resolve-ean", () => ({ resolveAndEnrich: vi.fn(async () => ({ source: "none" })) }));

import { syncMerchantPOS } from "@/lib/pos/sync-engine";

type Cap = {
    table: string;
    op: "select" | "update" | "upsert";
    payload?: unknown;
    filters: Record<string, unknown>;
    hasOr: boolean;
    single: boolean;
};

/** Faux client Supabase : chaque chaîne est thenable et résolue par `respond(cap)`. */
function makeSupabase(respond: (c: Cap) => { data: unknown; error: unknown }) {
    const captures: Cap[] = [];
    function builder(table: string) {
        const st: Cap = { table, op: "select", filters: {}, hasOr: false, single: false };
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.update = (p: unknown) => { st.op = "update"; st.payload = p; return b; };
        b.upsert = (p: unknown) => { st.op = "upsert"; st.payload = p; return b; };
        b.eq = (c: string, v: unknown) => { st.filters[c] = v; return b; };
        b.in = (c: string, v: unknown) => { st.filters[c] = v; return b; };
        b.is = (c: string, v: unknown) => { st.filters[c] = v; return b; };
        b.or = () => { st.hasOr = true; return b; };
        b.single = () => { st.single = true; return b; };
        b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            const snap: Cap = { ...st, filters: { ...st.filters } };
            captures.push(snap);
            return Promise.resolve(respond(snap)).then(resolve, reject);
        };
        return b;
    }
    const client = { from: (t: string) => builder(t) } as never;
    return { client, captures };
}

const CONN = { id: "c1", access_token: "x", refresh_token: null, expires_at: null, shop_domain: null };

/** Réponses par défaut : lock acquis, connexion lue, produits vides, reste OK. */
function defaultRespond(c: Cap): { data: unknown; error: unknown } {
    if (c.table === "pos_connections" && c.op === "update" && c.hasOr) return { data: [{ id: "c1" }], error: null };
    if (c.table === "pos_connections" && c.op === "select" && c.single) return { data: CONN, error: null };
    if (c.table === "products" && c.op === "select") return { data: [], error: null };
    return { data: null, error: null };
}

const isErrorBookkeeping = (c: Cap) =>
    c.table === "pos_connections" && c.op === "update" && !c.hasOr && c.filters.merchant_id === "m1";
const isSuccessBookkeeping = (c: Cap) =>
    c.table === "pos_connections" && c.op === "update" && (c.payload as { last_sync_status?: string } | undefined)?.last_sync_status === "success";

const ZERO_RESULT = {
    products_created: 0,
    products_updated: 0,
    stock_updated: 0,
    promos_imported: 0,
    products_enriched: 0,
    pos_items_total: 0,
    visible_count: 0,
};

beforeEach(() => {
    vi.clearAllMocks();
    h.ensureFreshAccessToken.mockResolvedValue("tok");
    h.adapter.getCatalog.mockResolvedValue([]);
    h.adapter.getStock.mockResolvedValue([]);
    h.adapter.fetchPromos.mockResolvedValue([]);
});

describe("syncMerchantPOS — contrat d'orchestration (ne rien perdre sans alerte)", () => {
    it("lock occupé par un autre sync → all-zeros, AUCUN token/adaptateur/écriture touché", async () => {
        const { client, captures } = makeSupabase((c) => {
            // lock non acquis : un autre sync détient `syncing_since`
            if (c.table === "pos_connections" && c.op === "update" && c.hasOr) return { data: [], error: null };
            return { data: null, error: null };
        });
        h.createClientMock.mockReturnValue(client);

        const res = await syncMerchantPOS("m1", "square");

        expect(res).toEqual(ZERO_RESULT);
        expect(h.ensureFreshAccessToken).not.toHaveBeenCalled();
        expect(h.adapter.getCatalog).not.toHaveBeenCalled();
        expect(h.captureError).not.toHaveBeenCalled();
        // une seule écriture (la tentative de lock) ; aucun bookkeeping success/error
        expect(captures.filter(isSuccessBookkeeping)).toHaveLength(0);
        expect(captures.filter(isErrorBookkeeping)).toHaveLength(0);
    });

    it("refresh token échoué → status `error`, captureError(provider), RE-LÈVE, catalogue jamais fetché", async () => {
        const { client, captures } = makeSupabase(defaultRespond);
        h.createClientMock.mockReturnValue(client);
        h.ensureFreshAccessToken.mockResolvedValue(null); // refresh KO

        await expect(syncMerchantPOS("m1", "square")).rejects.toThrow(/Token expired and refresh failed/);

        const errUpd = captures.find(isErrorBookkeeping);
        expect(errUpd).toBeTruthy();
        const payload = errUpd!.payload as { last_sync_status: string; last_sync_error: string; syncing_since: unknown };
        expect(payload.last_sync_status).toBe("error");
        expect(payload.last_sync_error).toMatch(/Token expired/);
        expect(payload.syncing_since).toBeNull(); // lock libéré
        expect(h.captureError).toHaveBeenCalledWith(expect.anything(), { merchantId: "m1", provider: "square" });
        expect(h.adapter.getCatalog).not.toHaveBeenCalled();
        expect(captures.filter(isSuccessBookkeeping)).toHaveLength(0);
    });

    it("lecture connexion en erreur DB → LÈVE `No POS connection found`, status `error`", async () => {
        const { client, captures } = makeSupabase((c) => {
            if (c.table === "pos_connections" && c.op === "update" && c.hasOr) return { data: [{ id: "c1" }], error: null };
            if (c.table === "pos_connections" && c.op === "select" && c.single) return { data: null, error: { message: "db down" } };
            return { data: null, error: null };
        });
        h.createClientMock.mockReturnValue(client);

        await expect(syncMerchantPOS("m1", "square")).rejects.toThrow(/No POS connection found for square/);

        const errUpd = captures.find(isErrorBookkeeping);
        expect((errUpd?.payload as { last_sync_status?: string } | undefined)?.last_sync_status).toBe("error");
        expect(h.captureError).toHaveBeenCalled();
    });

    it("hoquet POS transitoire (getCatalog jette) → status `error`, JAMAIS de masquage orphelins ni de `success`", async () => {
        const { client, captures } = makeSupabase(defaultRespond);
        h.createClientMock.mockReturnValue(client);
        h.adapter.getCatalog.mockRejectedValue(new Error("502 Bad Gateway"));

        await expect(syncMerchantPOS("m1", "square")).rejects.toThrow(/502 Bad Gateway/);

        const errUpd = captures.find(isErrorBookkeeping);
        expect((errUpd?.payload as { last_sync_error?: string } | undefined)?.last_sync_error).toMatch(/502/);
        // INVARIANT anti catalogue-fantôme : aucune réconciliation (update visible:false sur .in("id",...))
        const orphanHide = captures.find(
            (c) => c.table === "products" && c.op === "update" &&
                (c.payload as { visible?: boolean } | undefined)?.visible === false &&
                Array.isArray((c.filters as { id?: unknown }).id),
        );
        expect(orphanHide).toBeUndefined();
        // INVARIANT anti faux-positif : jamais rapporté « success »
        expect(captures.filter(isSuccessBookkeeping)).toHaveLength(0);
        expect(h.captureError).toHaveBeenCalled();
    });

    it("chemin nominal (catalogue vide) → status `success`, last_sync_error null, sans captureError", async () => {
        const { client, captures } = makeSupabase(defaultRespond);
        h.createClientMock.mockReturnValue(client);

        const res = await syncMerchantPOS("m1", "square");

        expect(res.pos_items_total).toBe(0);
        expect(res.visible_count).toBe(0);
        const okUpd = captures.find(isSuccessBookkeeping);
        expect(okUpd).toBeTruthy();
        const payload = okUpd!.payload as { last_sync_status: string; last_sync_error: unknown; syncing_since: unknown };
        expect(payload.last_sync_error).toBeNull();
        expect(payload.syncing_since).toBeNull();
        // merchants.pos_last_sync rafraîchi
        expect(captures.find((c) => c.table === "merchants" && c.op === "update")).toBeTruthy();
        // aucun échec → aucune remontée d'erreur, aucun bookkeeping `error`
        expect(h.captureError).not.toHaveBeenCalled();
        expect(captures.filter(isErrorBookkeeping)).toHaveLength(0);
    });
});
