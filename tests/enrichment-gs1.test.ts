import { describe, it, expect } from "vitest";
import { parseGs1Response } from "@/lib/enrichment/gs1";
import { combineTierScores, scoreToReviewStatus, TIER_SCORES } from "@/lib/enrichment/score-cascade";

describe("parseGs1Response — normalisation réponse GS1", () => {
    it("parse un item direct (brand/name/image/category)", () => {
        const r = parseGs1Response({
            gtin: "3017620422003",
            brandName: "Ferrero",
            productName: "Nutella Pâte à tartiner 750g",
            productImageUrl: "https://img.gs1.example/nutella.jpg",
            gpcCategoryName: "Pâtes à tartiner",
        });
        expect(r).not.toBeNull();
        expect(r!.gtin).toBe("3017620422003");
        expect(r!.brand).toBe("Ferrero");
        expect(r!.name).toContain("Nutella");
        expect(r!.imageUrl).toContain("nutella.jpg");
        expect(r!.category).toBe("Pâtes à tartiner");
    });

    it("déballe une enveloppe { items: [...] }", () => {
        const r = parseGs1Response({ items: [{ gtin: "4006381333931", brand: "Acme" }] });
        expect(r?.gtin).toBe("4006381333931");
        expect(r?.brand).toBe("Acme");
    });

    it("rejette un GTIN au checksum invalide", () => {
        expect(parseGs1Response({ gtin: "3017620422004", brandName: "X" })).toBeNull();
    });

    it("rejette une réponse vide / sans item", () => {
        expect(parseGs1Response(null)).toBeNull();
        expect(parseGs1Response({})).toBeNull();
        expect(parseGs1Response({ items: [] })).toBeNull();
    });
});

describe("Tier GS1 dans le scoring", () => {
    it("GS1 est autoritatif (0,99) → auto-publish seul", () => {
        expect(TIER_SCORES.tier1_gs1).toBe(0.99);
        const score = combineTierScores(["tier1_gs1"]);
        expect(score).toBe(0.99);
        expect(scoreToReviewStatus(score)).toBe("validated");
    });

    it("GS1 + une autre source convergent → score boosté plafonné", () => {
        const score = combineTierScores(["tier1_gs1", "tier2_off"]);
        expect(score).toBeGreaterThanOrEqual(0.99);
        expect(score).toBeLessThanOrEqual(0.999);
    });
});
