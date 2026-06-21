import { describe, it, expect, vi } from "vitest";
import { pickUniqueProduct, resolveWebhookProduct } from "@/lib/pos/resolve-product";

vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));

/**
 * Stub minimal du chaînage Supabase `from(...).select(...).eq(...)` utilisé par
 * resolveWebhookProduct. `eq` est thenable et résout `{ data, error }`.
 */
function makeSupabase(result: { data: unknown; error: unknown }) {
    const eq = vi.fn().mockResolvedValue(result);
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    return { from } as never;
}

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

describe("resolveWebhookProduct — perte silencieuse north-star n°1 (erreur DB ≠ produit non suivi)", () => {
    it("1 produit → le résout", async () => {
        const supabase = makeSupabase({ data: [{ id: "p1", merchant_id: "m1" }], error: null });
        await expect(resolveWebhookProduct(supabase, "sq-1", "square")).resolves.toEqual({
            id: "p1",
            merchant_id: "m1",
        });
    });

    it("0 produit (non suivi = normal) → null SANS lever", async () => {
        const supabase = makeSupabase({ data: [], error: null });
        await expect(resolveWebhookProduct(supabase, "sq-unknown", "square")).resolves.toBeNull();
    });

    it("collision multi-tenant (≥2) → null SANS lever (interim sûr, devient visible)", async () => {
        const supabase = makeSupabase({
            data: [
                { id: "p1", merchant_id: "m1" },
                { id: "p2", merchant_id: "m2" },
            ],
            error: null,
        });
        await expect(resolveWebhookProduct(supabase, "shared", "lightspeed")).resolves.toBeNull();
    });

    it("ÉCHEC DE LECTURE DB → LÈVE (jamais null silencieux) → 500 + retry POS, pas de perte", async () => {
        const supabase = makeSupabase({ data: null, error: { message: "connection reset" } });
        await expect(resolveWebhookProduct(supabase, "sq-1", "square")).rejects.toThrow(
            /échec lecture produit/,
        );
    });
});
