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
        for (const m of ["select", "eq", "not", "is", "gt", "limit", "update", "upsert", "in"]) b[m] = pass;
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
