import { describe, it, expect } from "vitest";
import { pickUniqueProduct } from "@/lib/pos/resolve-product";

// Collecte ③ passe 3 — interim sûr du bug multi-tenant : un pos_item_id partagé par
// plusieurs marchands ne doit JAMAIS être appliqué au hasard (il devient ambigu/visible).

describe("pickUniqueProduct", () => {
    it("1 candidat → le produit, non ambigu", () => {
        const r = pickUniqueProduct([{ id: "p1", merchant_id: "m1" }]);
        expect(r).toEqual({ product: { id: "p1", merchant_id: "m1" }, ambiguous: false });
    });

    it("0 candidat → null, non ambigu (produit non suivi = normal)", () => {
        expect(pickUniqueProduct([])).toEqual({ product: null, ambiguous: false });
    });

    it("≥2 candidats → null + ambiguous (collision multi-tenant)", () => {
        const r = pickUniqueProduct([
            { id: "p1", merchant_id: "m1" },
            { id: "p2", merchant_id: "m2" },
        ]);
        expect(r.product).toBeNull();
        expect(r.ambiguous).toBe(true);
    });

    it("null/undefined → null, non ambigu", () => {
        expect(pickUniqueProduct(null)).toEqual({ product: null, ambiguous: false });
        expect(pickUniqueProduct(undefined)).toEqual({ product: null, ambiguous: false });
    });
});
