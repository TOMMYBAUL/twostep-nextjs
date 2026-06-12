import { describe, it, expect } from "vitest";
import { selectProductsToZero } from "@/lib/ingest/reconcile";

const inStock = (ids: string[]) => ids.map((id) => ({ id, quantity: 5 }));

describe("selectProductsToZero — décrémentation par réconciliation", () => {
    it("met à 0 les produits en stock absents du push", () => {
        const existing = inStock(["a", "b", "c", "d"]);
        const touched = new Set(["a", "b", "c"]); // d est vendu, absent du push
        const r = selectProductsToZero(touched, existing);
        expect(r.skipped).toBe(false);
        expect(r.toZero).toEqual(["d"]);
    });

    it("ne touche rien si tous les produits sont dans le push", () => {
        const existing = inStock(["a", "b", "c"]);
        const touched = new Set(["a", "b", "c"]);
        const r = selectProductsToZero(touched, existing);
        expect(r.toZero).toEqual([]);
        expect(r.skipped).toBe(false);
    });

    it("GARDE-FOU : annule la réconciliation si le push couvre <50% d'un gros catalogue", () => {
        const existing = inStock(Array.from({ length: 100 }, (_, i) => `p${i}`));
        const touched = new Set(["p0", "p1", "p2"]); // fichier tronqué : 3/100
        const r = selectProductsToZero(touched, existing);
        expect(r.skipped).toBe(true);
        expect(r.toZero).toEqual([]);
        expect(r.reason).toContain("partiel");
    });

    it("n'applique PAS le garde-fou sur un petit catalogue (variation normale)", () => {
        const existing = inStock(["a", "b", "c"]); // 3 < minCatalogForGuard (10)
        const touched = new Set(["a"]); // 1/3, mais petit catalogue
        const r = selectProductsToZero(touched, existing);
        expect(r.skipped).toBe(false);
        expect(r.toZero.sort()).toEqual(["b", "c"]);
    });

    it("catalogue vide → rien à faire", () => {
        const r = selectProductsToZero(new Set(), []);
        expect(r).toEqual({ toZero: [], skipped: false });
    });
});
