import { describe, it, expect } from "vitest";
import {
    isStockStale,
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
