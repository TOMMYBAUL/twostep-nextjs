import { describe, it, expect } from "vitest";
import {
    isStockStale,
    isInvisibleOrphan,
    computeCategoryPriceBounds,
    isPriceAberrant,
} from "@/lib/monitoring/quality";

const now = new Date("2026-06-12T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("isStockStale — détection stock figé", () => {
    it("qty>0 + pas de mouvement depuis 30j → figé", () => {
        expect(isStockStale(daysAgo(30), 5, now)).toBe(true);
    });
    it("qty>0 + mouvement récent → OK", () => {
        expect(isStockStale(daysAgo(3), 5, now)).toBe(false);
    });
    it("qty 0 → jamais figé (épuisé, normal)", () => {
        expect(isStockStale(daysAgo(90), 0, now)).toBe(false);
    });
    it("jamais mis à jour + en stock → suspect", () => {
        expect(isStockStale(null, 5, now)).toBe(true);
    });
});

describe("isInvisibleOrphan — dérive de complétude « produit vendable rendu invisible »", () => {
    // Le cas DÉRIVE : principal (variant_of=null), non-pending, nommé, en stock, mais masqué.
    const orphan = {
        variantOf: null,
        visible: false,
        quantity: 3,
        reviewStatus: "validated" as string | null,
        name: "Nike Air Force 1 blanche 42",
    };

    it("principal validé, nommé, en stock mais visible=false → DÉRIVE (perdu du feed + vitrine)", () => {
        expect(isInvisibleOrphan(orphan)).toBe(true);
    });
    it("review_status null (legacy/DEFAULT validated) → traité comme validé → DÉRIVE", () => {
        expect(isInvisibleOrphan({ ...orphan, reviewStatus: null })).toBe(true);
    });

    // Les EXCLUSIONS légitimes (« zéro faux positif ») — chacune doit rendre false.
    it("visible=true → PAS une dérive (publié normalement)", () => {
        expect(isInvisibleOrphan({ ...orphan, visible: true })).toBe(false);
    });
    it("vraie variante (variant_of non-null) → masquée à dessein → PAS une dérive", () => {
        expect(isInvisibleOrphan({ ...orphan, variantOf: "principal-id" })).toBe(false);
    });
    it("pending_review (non validé) → invisible LÉGITIME (attend validation marchand)", () => {
        expect(isInvisibleOrphan({ ...orphan, reviewStatus: "pending_review" })).toBe(false);
        expect(isInvisibleOrphan({ ...orphan, reviewStatus: "pending" })).toBe(false);
        expect(isInvisibleOrphan({ ...orphan, reviewStatus: "masked" })).toBe(false);
    });
    it("masquage DÉLIBÉRÉ (review_status='rejected' via reject/DELETE soft-delete/PATCH) → PAS un orphelin (anti faux positif HIGH)", () => {
        // Un produit POS soft-delete OU rejeté OU masqué à la main porte review_status='rejected'
        // (marqueur d'intention) → même s'il garde nom + stock + variant_of=null, ce n'est PAS une
        // dérive : le marchand l'a masqué EXPRÈS. Sans ce marqueur, l'alarme crierait au loup chaque jour.
        expect(isInvisibleOrphan({ ...orphan, reviewStatus: "rejected" })).toBe(false);
    });
    it("stock ≤ 0 → rupture légitime, rien à perdre → PAS une dérive", () => {
        expect(isInvisibleOrphan({ ...orphan, quantity: 0 })).toBe(false);
        expect(isInvisibleOrphan({ ...orphan, quantity: -1 })).toBe(false);
    });
    it("fiche sans nom (ou nom espaces) → incomplète, invisible LÉGITIME", () => {
        expect(isInvisibleOrphan({ ...orphan, name: null })).toBe(false);
        expect(isInvisibleOrphan({ ...orphan, name: "   " })).toBe(false);
    });
    it("visible null/undefined (donnée absente) → pas une dérive PROUVÉE → PAS flag (col DEFAULT true)", () => {
        expect(isInvisibleOrphan({ ...orphan, visible: null })).toBe(false);
        expect(isInvisibleOrphan({ ...orphan, visible: undefined })).toBe(false);
    });
});

describe("prix aberrant — bornes robustes par catégorie", () => {
    const prices = [20, 22, 24, 25, 25, 26, 28, 30, 30, 32, 35]; // sneakers ~20-35€

    it("calcule des bornes IQR sur un échantillon suffisant", () => {
        const b = computeCategoryPriceBounds(prices);
        expect(b).not.toBeNull();
        expect(b!.count).toBe(11);
        expect(b!.lower).toBeLessThan(20);
        expect(b!.upper).toBeGreaterThan(35);
    });

    it("retourne null si échantillon trop petit (<8)", () => {
        expect(computeCategoryPriceBounds([10, 12, 14])).toBeNull();
    });

    it("flag un prix aberrant (faute de saisie : 2500 au lieu de 25)", () => {
        const b = computeCategoryPriceBounds(prices);
        expect(isPriceAberrant(2500, b)).toBe(true);
    });

    it("ne flag pas un prix normal", () => {
        const b = computeCategoryPriceBounds(prices);
        expect(isPriceAberrant(27, b)).toBe(false);
    });

    it("prix ≤ 0 toujours aberrant, même sans bornes", () => {
        expect(isPriceAberrant(0, null)).toBe(true);
        expect(isPriceAberrant(-5, null)).toBe(true);
        expect(isPriceAberrant(null, null)).toBe(true);
    });
});
