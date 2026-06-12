import { describe, it, expect } from "vitest";
import { parseKicksResponse } from "@/lib/enrichment/kicksdb";
import { combineTierScores, scoreToReviewStatus, TIER_SCORES } from "@/lib/enrichment/score-cascade";

describe("parseKicksResponse — normalisation sneakers", () => {
    it("parse un item avec variantes par taille", () => {
        const r = parseKicksResponse({
            data: [
                {
                    name: "Air Jordan 1 Retro High OG",
                    style_id: "DZ5485-031",
                    brand: "Jordan",
                    upc: "0195867374074",
                    image: "https://img.kicks.example/aj1.jpg",
                    variants: [
                        { size: "42", price: 180 },
                        { size: "43", lowest_ask: "200" },
                    ],
                },
            ],
        });
        expect(r).not.toBeNull();
        expect(r!.name).toContain("Air Jordan 1");
        expect(r!.sku).toBe("DZ5485-031");
        expect(r!.brand).toBe("Jordan");
        expect(r!.sizes).toEqual([
            { size: "42", price: 180 },
            { size: "43", price: 200 },
        ]);
    });

    it("garde un item sans UPC valide (identité par SKU/nom)", () => {
        const r = parseKicksResponse({ name: "Yeezy 350", style_id: "X", upc: "not-a-gtin" });
        expect(r?.gtin).toBeNull();
        expect(r?.name).toBe("Yeezy 350");
    });

    it("rejette un item sans nom ni SKU", () => {
        expect(parseKicksResponse({ data: [{ brand: "Nike" }] })).toBeNull();
        expect(parseKicksResponse(null)).toBeNull();
    });
});

describe("Tier KicksDB dans le scoring", () => {
    it("KicksDB est fiable (0,97) → auto-publish seul", () => {
        expect(TIER_SCORES.tier_kicksdb).toBe(0.97);
        expect(scoreToReviewStatus(combineTierScores(["tier_kicksdb"]))).toBe("validated");
    });
});
