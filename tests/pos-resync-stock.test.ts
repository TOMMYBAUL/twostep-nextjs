import { describe, it, expect, vi } from "vitest";
import { mapStockUpdatesToProducts, resyncMerchantStock, resyncAllMerchantsStock } from "@/lib/pos/resync-stock";
import { getActivePosAccessToken } from "@/lib/pos/access-token";

vi.mock("@/lib/pos/access-token", () => ({ getActivePosAccessToken: vi.fn() }));

describe("#14 mapStockUpdatesToProducts — re-sync stock absolu (fix retours)", () => {
    const products = [
        { id: "p1", pos_item_id: "sq-1" },
        { id: "p2", pos_item_id: "sq-2" },
        { id: "p3", pos_item_id: null },
    ];

    it("associe les quantités absolues POS aux bons produits", () => {
        const out = mapStockUpdatesToProducts(products, [
            { pos_item_id: "sq-1", quantity: 7, updated_at: "x" },
            { pos_item_id: "sq-2", quantity: 0, updated_at: "x" },
        ]);
        expect(out).toEqual([
            { productId: "p1", quantity: 7 },
            { productId: "p2", quantity: 0 },
        ]);
    });

    it("corrige une dérive : le POS dit 5 (après retour) → on remet 5", () => {
        // Two-Step affichait 4 (retour non capté) ; le POS absolu dit 5.
        const out = mapStockUpdatesToProducts(products, [
            { pos_item_id: "sq-1", quantity: 5, updated_at: "x" },
        ]);
        expect(out[0]).toEqual({ productId: "p1", quantity: 5 });
    });

    it("ignore un pos_item_id inconnu et clampe les négatifs à 0", () => {
        const out = mapStockUpdatesToProducts(products, [
            { pos_item_id: "inconnu", quantity: 9, updated_at: "x" },
            { pos_item_id: "sq-1", quantity: -3, updated_at: "x" },
        ]);
        expect(out).toEqual([{ productId: "p1", quantity: 0 }]);
    });
});

/** Faux client admin : un thenable par table, résolvant selon `results`. */
function makeAdmin(results: Record<string, { data: unknown; error: { message: string } | null }>) {
    function builder(table: string) {
        const b: Record<string, unknown> = {};
        const pass = () => b;
        for (const m of ["select", "eq", "not", "is", "gt", "limit", "update", "upsert", "in", "order"]) b[m] = pass;
        b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve, reject);
        return b;
    }
    return { from: (t: string) => builder(t) } as never;
}

describe("resync stock — lectures non silencieuses (anti dérive derrière voyant vert)", () => {
    it("resyncMerchantStock : échec de lecture des produits → ok:false (pas un faux ok:true/fetched:0)", async () => {
        // Connexion présente → on atteint la lecture des produits.
        vi.mocked(getActivePosAccessToken).mockResolvedValue({
            adapter: { getStock: vi.fn() },
            accessToken: "tok",
            provider: "shopify",
            shopDomain: null,
        } as never);
        const admin = makeAdmin({ products: { data: null, error: { message: "read boom" } } });
        const r = await resyncMerchantStock("m1", admin);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe("products_read_failed");
        expect(r.fetched).toBe(0);
    });

    it("resyncAllMerchantsStock : échec de lecture des connexions → LÈVE (pas un faux succès sur 0 marchand)", async () => {
        const admin = makeAdmin({ pos_connections: { data: null, error: { message: "conns boom" } } });
        await expect(resyncAllMerchantsStock(admin)).rejects.toThrow(/connexions POS/i);
    });
});

/**
 * SCALE / VOLUME — anti-troncature `max-rows` PostgREST (classe LESSONS « SELECT non borné
 * → troncature silencieuse à 1000 ») sur le chemin d'AUTO-GUÉRISON de la dérive de stock.
 *
 * Faux client fidèle à PostgREST en KEYSET : `.limit(n)` plafonné à 1000 (max-rows),
 * `.gt(col, curseur)` = borne basse EXCLUSIVE par VALEUR. Sans `fetchAllRows`, le SELECT
 * produits rendait au plus 1000 lignes SANS erreur → les produits au-delà du 1000ᵉ
 * n'étaient JAMAIS re-synchronisés (dérive jamais guérie, enjeu n°1) ; et `.limit(5000)`
 * sur pos_connections était de toute façon plafonné à 1000 marchands.
 */
const MAX_ROWS = 1000;

type KeysetTable = {
    rows: Array<Record<string, unknown>>;
    /** Erreur à injecter sur les upserts de LOT (longueur > 1) pour tester le repli mono-ligne. */
    batchUpsertError?: { message: string } | null;
    /** product_id dont l'upsert MONO-ligne doit échouer (repli). */
    failRowIds?: Set<string>;
};

/**
 * Faux admin keyset : SELECT paginés plafonnés à max-rows, upserts stock COMPTÉS
 * (`upsertBatches` = tailles des lots reçus) pour prouver le batching par 500.
 */
function makeKeysetAdmin(tables: Record<string, KeysetTable>) {
    const upsertBatches: number[] = [];
    const upsertedIds: string[] = [];
    const pageCursors: Array<string | number | null> = [];

    function builder(table: string) {
        const td = tables[table] ?? { rows: [] };
        const st = { cursor: null as string | number | null, limitN: null as number | null };

        const b: Record<string, unknown> = {};
        const pass = () => b;
        for (const m of ["select", "eq", "not", "is", "in", "order", "update"]) b[m] = pass;
        b.gt = (_col: string, val: string | number) => {
            st.cursor = val;
            return b;
        };
        b.limit = (n: number) => {
            st.limitN = n;
            return b;
        };
        b.upsert = (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
            const rows = Array.isArray(payload) ? payload : [payload];
            if (rows.length > 1 && td.batchUpsertError) {
                upsertBatches.push(rows.length);
                return Promise.resolve({ data: null, error: td.batchUpsertError });
            }
            if (rows.length === 1 && td.failRowIds?.has(rows[0].product_id as string)) {
                return Promise.resolve({ data: null, error: { message: `row boom ${rows[0].product_id}` } });
            }
            upsertBatches.push(rows.length);
            for (const r of rows) upsertedIds.push(r.product_id as string);
            return Promise.resolve({ data: null, error: null });
        };
        b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            pageCursors.push(st.cursor);
            let rows = td.rows;
            // KEYSET : borne basse exclusive par valeur (colonne-curseur = 1re clé du row).
            if (st.cursor !== null) {
                rows = rows.filter((r) => {
                    const key = Object.keys(r)[0];
                    return (r[key] as string | number) > (st.cursor as string | number);
                });
            }
            // Plafond min(limit demandé, max-rows) — PostgREST tronque même une limite plus large.
            const cap = Math.min(st.limitN ?? MAX_ROWS, MAX_ROWS);
            if (rows.length > cap) rows = rows.slice(0, cap);
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        };
        return b;
    }
    return {
        admin: { from: (t: string) => builder(t) } as never,
        upsertBatches,
        upsertedIds,
        pageCursors,
    };
}

const pid = (i: number) => `p${String(i).padStart(5, "0")}`; // ordre lexical = ordre .order("id")

describe("resync stock — SCALE >1000 (pagination KEYSET + upserts par lots)", () => {
    it("resyncMerchantStock : 1500 produits POS → TOUS lus (2 pages keyset) et TOUS re-synchronisés par lots de 500", async () => {
        const products = Array.from({ length: 1500 }, (_, i) => ({ id: pid(i), pos_item_id: `pos-${i}` }));
        const getStock = vi.fn(async (_tok: string, itemIds: string[]) =>
            itemIds.map((id) => ({ pos_item_id: id, quantity: 3, updated_at: "x" })),
        );
        vi.mocked(getActivePosAccessToken).mockResolvedValue({
            adapter: { getStock },
            accessToken: "tok",
            provider: "square",
            shopDomain: null,
        } as never);
        const { admin, upsertBatches, upsertedIds, pageCursors } = makeKeysetAdmin({
            products: { rows: products },
            stock: { rows: [] },
            pos_connections: { rows: [] },
        });

        const r = await resyncMerchantStock("m1", admin);

        // AUCUN produit oublié : l'adapter reçoit les 1500 pos_item_id (pas 1000).
        expect(getStock.mock.calls[0][1]).toHaveLength(1500);
        // Lecture produits en 2 pages KEYSET : 1re sans borne, 2e bornée par le 1000ᵉ id.
        expect(pageCursors.slice(0, 2)).toEqual([null, pid(999)]);
        // Écriture par LOTS de 500 (pattern snapshot), pas 1500 aller-retours mono-ligne.
        expect(upsertBatches).toEqual([500, 500, 500]);
        expect(upsertedIds).toHaveLength(1500);
        expect(r.ok).toBe(true);
        expect(r.updated).toBe(1500); // dérive guérie sur TOUT le catalogue, pas 1000
        expect(r.fetched).toBe(1500);
    });

    it("lot d'upsert en échec → repli MONO-LIGNE : 1 ligne toxique signalée, les autres écrites (statut partial honnête)", async () => {
        const products = Array.from({ length: 3 }, (_, i) => ({ id: pid(i), pos_item_id: `pos-${i}` }));
        vi.mocked(getActivePosAccessToken).mockResolvedValue({
            adapter: {
                getStock: vi.fn(async () =>
                    products.map((p) => ({ pos_item_id: p.pos_item_id, quantity: 1, updated_at: "x" })),
                ),
            },
            accessToken: "tok",
            provider: "square",
            shopDomain: null,
        } as never);
        const { admin, upsertedIds } = makeKeysetAdmin({
            products: { rows: products },
            stock: { rows: [], batchUpsertError: { message: "batch boom" }, failRowIds: new Set([pid(1)]) },
            pos_connections: { rows: [] },
        });

        const r = await resyncMerchantStock("m1", admin);

        // Le lot échoue → chaque ligne retentée seule : 2 écrites, 1 en échec VISIBLE.
        expect(upsertedIds).toEqual([pid(0), pid(2)]);
        expect(r.updated).toBe(2);
        expect(r.ok).toBe(false); // jamais un voyant vert sur une écriture perdue
        expect(r.reason).toMatch(/1 stock write/);
    });

    it("doublon POS (même produit 2×) dans un lot → dédupliqué (dernier gagne), jamais 2 lignes ON CONFLICT dans le même lot", async () => {
        vi.mocked(getActivePosAccessToken).mockResolvedValue({
            adapter: {
                getStock: vi.fn(async () => [
                    { pos_item_id: "pos-0", quantity: 4, updated_at: "x" },
                    { pos_item_id: "pos-0", quantity: 9, updated_at: "x" },
                ]),
            },
            accessToken: "tok",
            provider: "square",
            shopDomain: null,
        } as never);
        const { admin, upsertedIds, upsertBatches } = makeKeysetAdmin({
            products: { rows: [{ id: pid(0), pos_item_id: "pos-0" }] },
            stock: { rows: [] },
            pos_connections: { rows: [] },
        });

        const r = await resyncMerchantStock("m1", admin);
        expect(upsertedIds).toEqual([pid(0)]); // une seule ligne pour p00000
        expect(upsertBatches).toEqual([1]);
        expect(r.updated).toBe(1);
    });

    it("resyncAllMerchantsStock : 1500 connexions POS → les 1500 marchands traités (l'ancien .limit(5000) plafonnait à 1000)", async () => {
        // Token indisponible → chaque marchand sort tôt : on ne teste ICI que la COMPLÉTUDE
        // de la liste (pagination keyset sur id, merchant_id non unique dans pos_connections).
        vi.mocked(getActivePosAccessToken).mockResolvedValue(null);
        const conns = Array.from({ length: 1500 }, (_, i) => ({
            id: `c${String(i).padStart(5, "0")}`,
            merchant_id: `m${String(i).padStart(5, "0")}`,
        }));
        const { admin, pageCursors } = makeKeysetAdmin({ pos_connections: { rows: conns } });

        const results = await resyncAllMerchantsStock(admin);

        expect(results).toHaveLength(1500); // pas 1000
        // 2 pages keyset sur pos_connections : sans borne, puis bornée par le 1000ᵉ id.
        expect(pageCursors.slice(0, 2)).toEqual([null, "c00999"]);
    });
});
