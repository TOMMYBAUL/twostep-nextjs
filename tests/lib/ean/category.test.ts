import { describe, expect, it } from "vitest";
import { mapEanCategoryToFr, FR_L1_SLUGS } from "@/lib/ean/category";

describe("mapEanCategoryToFr", () => {
    // ── The real-world regression (maillon 9 test of 2026-06-27) ──
    // Verified IN PROD: after EAN enrichment, products.category held English source labels
    // ("clothing and fashion" ×2, "toys" ×2, "home and garden" ×1) instead of French slugs.
    // This is the "preuve sans yeux": a fixture of the EXACT strings the sources stored, locking
    // the English→French translation without needing to look at a screen.
    it.each([
        // [source label as stored in prod, expected FR L1 slug]
        ["clothing and fashion", "mode"], // Ray-Ban + Nike (source labelled both "clothing and fashion")
        ["toys", "enfants"], // LEGO + VTech
        ["home and garden", "maison-deco"], // Coca-Cola — SOURCE MISLABEL, translated faithfully (see note)
    ])("translates the real prod label %j → %s", (raw, expected) => {
        expect(mapEanCategoryToFr(raw)).toBe(expected);
    });

    it("handles the many source spellings of the same category (& vs and, commas, casing)", () => {
        expect(mapEanCategoryToFr("Home & Garden")).toBe("maison-deco");
        expect(mapEanCategoryToFr("Home and Garden")).toBe("maison-deco");
        expect(mapEanCategoryToFr("Clothing & Fashion")).toBe("mode");
        expect(mapEanCategoryToFr("Food, Beverages & Tobacco")).toBe("alimentation");
        expect(mapEanCategoryToFr("  TOYS  ")).toBe("enfants");
        expect(mapEanCategoryToFr("Sports & Outdoors")).toBe("sport-outdoor");
        expect(mapEanCategoryToFr("Cameras & Optics")).toBe("tech-electronique");
    });

    it("maps a representative label for each French L1 family", () => {
        expect(mapEanCategoryToFr("apparel")).toBe("mode");
        expect(mapEanCategoryToFr("shoes")).toBe("chaussures");
        expect(mapEanCategoryToFr("beauty")).toBe("beaute");
        expect(mapEanCategoryToFr("jewelry")).toBe("bijoux-accessoires");
        expect(mapEanCategoryToFr("sunglasses")).toBe("bijoux-accessoires");
        expect(mapEanCategoryToFr("sporting goods")).toBe("sport-outdoor");
        expect(mapEanCategoryToFr("electronics")).toBe("tech-electronique");
        expect(mapEanCategoryToFr("furniture")).toBe("maison-deco");
        expect(mapEanCategoryToFr("grocery")).toBe("alimentation");
        expect(mapEanCategoryToFr("baby")).toBe("enfants");
        expect(mapEanCategoryToFr("books")).toBe("culture-loisirs");
        expect(mapEanCategoryToFr("pharmacy")).toBe("sante-bien-etre");
        expect(mapEanCategoryToFr("pet supplies")).toBe("animaux");
        expect(mapEanCategoryToFr("automotive")).toBe("auto-mobilite");
        expect(mapEanCategoryToFr("tools")).toBe("bricolage-jardin");
    });

    // ── North-star: ZERO false positives → unknown/ambiguous → null (never invent) ──
    it("returns null for unrecognised labels (no invention)", () => {
        expect(mapEanCategoryToFr("uncategorized")).toBeNull();
        expect(mapEanCategoryToFr("misc")).toBeNull();
        expect(mapEanCategoryToFr("general")).toBeNull();
        expect(mapEanCategoryToFr("widgets and gadgets")).toBeNull();
    });

    it("returns null for genuinely AMBIGUOUS labels rather than guessing", () => {
        // bare "games" could be video games (tech) or board games (enfants) → don't guess
        expect(mapEanCategoryToFr("games")).toBeNull();
        // "office" could be business supplies or papeterie → don't guess
        expect(mapEanCategoryToFr("office")).toBeNull();
        expect(mapEanCategoryToFr("personal care")).toBeNull();
    });

    it("returns null for null/undefined/empty input", () => {
        expect(mapEanCategoryToFr(null)).toBeNull();
        expect(mapEanCategoryToFr(undefined)).toBeNull();
        expect(mapEanCategoryToFr("")).toBeNull();
        expect(mapEanCategoryToFr("   ")).toBeNull();
    });

    it("is idempotent: a value that is ALREADY a French L1 slug passes through unchanged", () => {
        // categorize.ts writes FR slugs to products.category; re-running enrichment must not break them.
        for (const slug of FR_L1_SLUGS) {
            expect(mapEanCategoryToFr(slug)).toBe(slug);
        }
        expect(mapEanCategoryToFr("MODE")).toBe("mode"); // case-insensitive passthrough
    });

    // ── Invariant: the mapper may ONLY ever emit a real taxonomy slug ──
    it("never emits a slug outside the 15 French L1 taxonomy slugs", () => {
        const slugSet = new Set(FR_L1_SLUGS);
        const samples = [
            "clothing and fashion", "toys", "home and garden", "shoes", "beauty",
            "jewelry", "sunglasses", "sporting goods", "electronics", "furniture",
            "grocery", "baby", "books", "pharmacy", "pet supplies", "automotive",
            "tools", "food, beverages & tobacco", "cameras & optics",
        ];
        for (const s of samples) {
            const result = mapEanCategoryToFr(s);
            if (result !== null) expect(slugSet.has(result)).toBe(true);
        }
    });
});
