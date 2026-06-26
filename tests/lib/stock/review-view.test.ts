import { describe, expect, it } from "vitest";
import { deriveReviewView, type ReviewBucket } from "@/lib/stock/review-view";

type Row = { id: string; review_status: ReviewBucket };

const rows = (...statuses: ReviewBucket[]): Row[] =>
    statuses.map((s, i) => ({ id: `p${i}`, review_status: s }));

describe("deriveReviewView — honnêteté du chargement (north-star, écran Validation enrichi)", () => {
    it("RÉGRESSION : loadError + 0 produit → error, JAMAIS un faux « rien à valider »", () => {
        // Le bug d'origine : le Server Component faisait `const { data: products }` (error JETÉ) →
        // un blip DB → products=null → `?? []` → EmptyState « Rien à valider. Connectez un POS… ».
        // Les fiches pending_review (invisibles en vitrine) ne seraient JAMAIS validées = catalogue
        // muet en silence. L'échec DOIT être dit, pas masqué en « tout est traité ».
        expect(deriveReviewView({ loadError: true, products: [], bucket: "pending_review" })).toEqual({
            kind: "error",
        });
    });

    it("loadError prime même quand des produits sont présents (lecture partielle/incohérente)", () => {
        expect(
            deriveReviewView({ loadError: true, products: rows("pending_review", "validated"), bucket: "validated" }),
        ).toEqual({ kind: "error" });
    });

    it("chargé OK + 0 produit → ready vide (EmptyState légitime, pas une erreur)", () => {
        expect(deriveReviewView({ loadError: false, products: [], bucket: "pending_review" })).toEqual({
            kind: "ready",
            counts: { pending_review: 0, validated: 0, rejected: 0 },
            filtered: [],
        });
    });

    it("chargé OK : compteurs par bucket exacts + filtre = bucket courant", () => {
        const products = rows("pending_review", "pending_review", "validated", "rejected", "rejected", "rejected");
        const view = deriveReviewView({ loadError: false, products, bucket: "pending_review" });
        expect(view).toEqual({
            kind: "ready",
            counts: { pending_review: 2, validated: 1, rejected: 3 },
            filtered: [products[0], products[1]],
        });
    });

    it("changer de bucket ne change QUE le filtre, pas les compteurs (totaux stables)", () => {
        const products = rows("pending_review", "validated", "rejected");
        const pending = deriveReviewView({ loadError: false, products, bucket: "pending_review" });
        const validated = deriveReviewView({ loadError: false, products, bucket: "validated" });
        const expectedCounts = { pending_review: 1, validated: 1, rejected: 1 };
        if (pending.kind !== "ready" || validated.kind !== "ready") throw new Error("attendu ready");
        expect(pending.counts).toEqual(expectedCounts);
        expect(validated.counts).toEqual(expectedCounts);
        expect(pending.filtered.map((p) => p.id)).toEqual(["p0"]);
        expect(validated.filtered.map((p) => p.id)).toEqual(["p1"]);
    });

    it("un statut hors-bucket (pending/masked du gate cascade) ne pollue PAS les compteurs (jamais NaN)", () => {
        // Robustesse : le SELECT ne filtre pas review_status ; un produit `pending`/`masked` avec
        // enrichment_source set ne doit pas produire un compteur fantôme/NaN.
        const products = [
            { id: "a", review_status: "pending_review" as ReviewBucket },
            { id: "b", review_status: "masked" as unknown as ReviewBucket },
        ];
        const view = deriveReviewView({ loadError: false, products, bucket: "pending_review" });
        if (view.kind !== "ready") throw new Error("attendu ready");
        expect(view.counts).toEqual({ pending_review: 1, validated: 0, rejected: 0 });
        expect(Object.values(view.counts).every((n) => Number.isFinite(n))).toBe(true);
        expect(view.filtered.map((p) => p.id)).toEqual(["a"]);
    });
});
