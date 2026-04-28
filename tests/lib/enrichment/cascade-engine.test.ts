import { describe, it, expect, vi, beforeEach } from "vitest";
import { preflightEan, runCascade } from "@/lib/enrichment/cascade-engine";

// Cycle 4 : on mock désormais `collectAllEanSources` au lieu de `fetchEanData`
// pour refléter le refactor multi-source convergence.
vi.mock("@/lib/ean/lookup", () => ({
    searchEanByName: vi.fn(),
}));

vi.mock("@/lib/enrichment/multi-source", () => ({
    collectAllEanSources: vi.fn(),
}));

vi.mock("@/lib/enrichment/tier1-sectoriels", () => ({
    lookupCipBdpm: vi.fn(),
    lookupIsbnDilicom: vi.fn().mockResolvedValue(null),
}));

import { searchEanByName } from "@/lib/ean/lookup";
import { collectAllEanSources } from "@/lib/enrichment/multi-source";
import { lookupCipBdpm } from "@/lib/enrichment/tier1-sectoriels";

const mockCollectAll = vi.mocked(collectAllEanSources);
const mockSearchEanByName = vi.mocked(searchEanByName);
const mockLookupCipBdpm = vi.mocked(lookupCipBdpm);

beforeEach(() => {
    mockCollectAll.mockReset();
    mockSearchEanByName.mockReset();
    mockLookupCipBdpm.mockReset();
});

/** Helper pour construire un MultiSourceResult mock. */
function multi(tiers: ("tier2_obf" | "tier2_icecat" | "tier2_off" | "tier6_eansearch")[], name: string | null = null) {
    return {
        tiers_matched: tiers as never,
        canonical_name: name,
        canonical_brand: null,
        canonical_category: null,
        canonical_photo_url: null,
        raw_results: [],
    };
}

describe("preflightEan", () => {
    it("validates a real EAN-13", () => {
        expect(preflightEan("5449000000996")).toEqual({
            valid: true,
            canonical: "5449000000996",
            type: "ean13",
        });
    });
    it("normalizes and validates EAN with spaces", () => {
        // 8056597144056 = Ray-Ban Wayfarer Classic, valide
        expect(preflightEan("8056597 144056")).toEqual({
            valid: true,
            canonical: "8056597144056",
            type: "ean13",
        });
    });
    it("rejects EAN with bad checksum", () => {
        expect(preflightEan("5449000000997")).toEqual({
            valid: false,
            canonical: null,
            type: "invalid",
        });
    });
    it("rejects EAN with letters", () => {
        expect(preflightEan("123ABC456789X")).toEqual({
            valid: false,
            canonical: null,
            type: "invalid",
        });
    });
    it("converts UPC-12 to EAN-13 with leading 0", () => {
        const result = preflightEan("036000291452"); // Reynolds Wrap UPC-A
        expect(result.valid).toBe(true);
        expect(result.canonical).toBe("0036000291452");
        expect(result.type).toBe("upc12");
    });
    it("detects CIP-13 médicament", () => {
        // 3400933264963 = Doliprane 1000 mg
        const result = preflightEan("3400933264963");
        expect(result.valid).toBe(true);
        expect(result.type).toBe("cip13");
    });
    it("detects ISBN-13", () => {
        const result = preflightEan("9782070612758");
        expect(result.valid).toBe(true);
        expect(result.type).toBe("isbn13");
    });
    it("returns invalid for null/empty", () => {
        expect(preflightEan(null)).toEqual({ valid: false, canonical: null, type: "invalid" });
        expect(preflightEan(undefined)).toEqual({ valid: false, canonical: null, type: "invalid" });
        expect(preflightEan("")).toEqual({ valid: false, canonical: null, type: "invalid" });
    });
});

describe("runCascade — EAN invalides (early return, pas de fetch)", () => {
    it("EAN cassé checksum → score 0, masked, aucun appel réseau", async () => {
        const out = await runCascade({ ean: "5449000000997" });
        expect(out.score).toBe(0);
        expect(out.review_status).toBe("masked");
        expect(out.tiers_matched).toEqual([]);
        expect(out.canonical_ean).toBeNull();
        expect(mockCollectAll).not.toHaveBeenCalled();
        expect(mockSearchEanByName).not.toHaveBeenCalled();
    });

    it("EAN avec lettres → score 0, ne tente même pas le reverse si name absent", async () => {
        const out = await runCascade({ ean: "123ABC456789X" });
        expect(out.score).toBe(0);
        expect(out.tiers_matched).toEqual([]);
        expect(mockCollectAll).not.toHaveBeenCalled();
    });

    it("Aucun input → score 0, masked", async () => {
        const out = await runCascade({});
        expect(out.score).toBe(0);
        expect(out.review_status).toBe("masked");
        expect(out.visible).toBe(false);
    });
});

describe("runCascade — cascade EAN valide", () => {
    it("EAN-13 valide + 1 source OBF seule → tier2_obf 0.97", async () => {
        mockCollectAll.mockResolvedValueOnce(multi(["tier2_obf"], "Coca-Cola Original 33cl"));
        const out = await runCascade({ ean: "5449000000996" });
        expect(out.score).toBe(0.97);
        expect(out.tiers_matched).toEqual(["tier2_obf"]);
        expect(out.canonical_ean).toBe("5449000000996");
        expect(out.canonical_name).toBe("Coca-Cola Original 33cl");
        expect(out.review_status).toBe("validated");
        expect(out.visible).toBe(true);
    });

    it("Cycle 4 — 2 tiers convergent (OBF + Tier6) → boost +0.015 → 0.985 publish auto", async () => {
        mockCollectAll.mockResolvedValueOnce(multi(["tier2_obf", "tier6_eansearch"], "Coca-Cola"));
        const out = await runCascade({ ean: "5449000000996" });
        expect(out.score).toBeCloseTo(0.985, 3);
        expect(out.tiers_matched).toEqual(["tier2_obf", "tier6_eansearch"]);
        expect(out.review_status).toBe("validated");
    });

    it("Cycle 4 — 3 tiers convergent → score capé proprement (≤ 0.999)", async () => {
        mockCollectAll.mockResolvedValueOnce(
            multi(["tier2_obf", "tier2_icecat", "tier6_eansearch"], "Sony WH-1000XM5"),
        );
        const out = await runCascade({ ean: "4548736133662" });
        expect(out.score).toBeLessThanOrEqual(0.999);
        expect(out.score).toBeGreaterThanOrEqual(0.97);
        expect(out.review_status).toBe("validated");
    });

    it("Tier 6 seul (cas EAN obscur sans Open Facts) → 0.90 → pending queue", async () => {
        mockCollectAll.mockResolvedValueOnce(multi(["tier6_eansearch"], "Ray-Ban Wayfarer"));
        const out = await runCascade({ ean: "8056597144056" });
        expect(out.score).toBe(0.9);
        expect(out.tiers_matched).toEqual(["tier6_eansearch"]);
        expect(out.review_status).toBe("pending");
    });

    it("Aucune source → fallback reverse search activé", async () => {
        mockCollectAll.mockResolvedValueOnce(multi([], null));
        mockSearchEanByName.mockResolvedValueOnce({
            ean: "4055017461258",
            brand: "Adidas",
            category: "sneakers",
        });
        const out = await runCascade({
            ean: "4055017461258",
            name: "Adidas Stan Smith Originals",
            brand: "Adidas",
        });
        expect(out.tiers_matched).toEqual(["tier6_eansearch"]);
        expect(out.canonical_ean).toBe("4055017461258");
    });
});

describe("runCascade — Tier 1 CIP médicament", () => {
    it("CIP-13 valide + BDPM trouve → tier1_cip 0.99 validated", async () => {
        mockLookupCipBdpm.mockResolvedValueOnce({
            canonical_name: "DOLIPRANE 1000 mg, comprimé",
            brand: "SANOFI AVENTIS FRANCE",
            category: "comprimé",
            sectorial_id: "3400933264963",
            source: "tier1_cip_bdpm",
        });
        const out = await runCascade({ ean: "3400933264963" });
        expect(out.score).toBe(0.99);
        expect(out.tiers_matched).toEqual(["tier1_cip"]);
        expect(out.canonical_ean).toBe("3400933264963");
        expect(out.canonical_name).toBe("DOLIPRANE 1000 mg, comprimé");
        expect(out.review_status).toBe("validated");
        // Pas de cascade Tier 2/6 lancée derrière
        expect(mockCollectAll).not.toHaveBeenCalled();
    });

    it("CIP-13 valide MAIS BDPM API down → fallback cascade Tier 2/6", async () => {
        mockLookupCipBdpm.mockResolvedValueOnce(null);
        mockCollectAll.mockResolvedValueOnce(multi(["tier6_eansearch"], "DOLIPRANE 1000 mg"));
        const out = await runCascade({ ean: "3400933264963" });
        expect(out.tiers_matched).toEqual(["tier6_eansearch"]);
        expect(out.score).toBe(0.9);
    });
});

describe("runCascade — pas d'EAN, reverse search par nom", () => {
    it("name riche → reverse trouve EAN → tier6 0.90 pending", async () => {
        mockSearchEanByName.mockResolvedValueOnce({
            ean: "8056597144056",
            brand: "Ray-Ban",
            category: "lunettes",
        });
        const out = await runCascade({
            name: "Ray-Ban Wayfarer Classic Black",
            brand: "Ray-Ban",
        });
        expect(out.tiers_matched).toEqual(["tier6_eansearch"]);
        expect(out.canonical_ean).toBe("8056597144056");
        expect(out.review_status).toBe("pending");
    });

    it("name trop générique → searchEanByName skip → tiers_matched vide → masked", async () => {
        // Le filtre isNameRichEnoughForReverseSearch est dans searchEanByName.
        // On simule qu'il a renvoyé null (skip ou pas de match).
        mockSearchEanByName.mockResolvedValueOnce(null);
        const out = await runCascade({ name: "Article 42" });
        expect(out.score).toBe(0);
        expect(out.review_status).toBe("masked");
    });

    it("name = description longue (bug observé 25/04 : nom = 'Sneakers iconiques, semelle Air visible') → reverse search peut retourner truc générique", async () => {
        // Cas réel : le parser CSV a mappé description en name.
        // Cascade actuelle ne peut PAS détecter ça — la pipeline trouve UN match
        // sur "sneakers iconiques semelle air" et le retourne. Tier 6 → 0.90.
        // C'est pour ça que le wizard step 2 (queue review humaine) reste essentiel.
        mockSearchEanByName.mockResolvedValueOnce({
            ean: "9999999999993", // candidat random qui aurait passé AI verify
            brand: null,
            category: null,
        });
        const out = await runCascade({
            name: "Sneakers iconiques, semelle Air visible",
            brand: "Nike",
        });
        expect(out.review_status).toBe("pending"); // Score 0.90 < 0.95 → queue OBLIGATOIRE
        // Bonne nouvelle : même si la cascade match, on ne publie PAS auto.
        // L'admin valide ou rejette en review.
    });
});
