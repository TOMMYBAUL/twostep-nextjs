import { describe, it, expect, vi, beforeEach } from "vitest";
import { preflightEan, runCascade } from "@/lib/enrichment/cascade-engine";

// Mock le module lookup pour ne pas appeler de vraies API HTTP
vi.mock("@/lib/ean/lookup", () => ({
    fetchEanData: vi.fn(),
    searchEanByName: vi.fn(),
}));

vi.mock("@/lib/enrichment/tier1-sectoriels", () => ({
    lookupCipBdpm: vi.fn(),
    lookupIsbnDilicom: vi.fn().mockResolvedValue(null),
}));

import { fetchEanData, searchEanByName } from "@/lib/ean/lookup";
import { lookupCipBdpm } from "@/lib/enrichment/tier1-sectoriels";

const mockFetchEanData = vi.mocked(fetchEanData);
const mockSearchEanByName = vi.mocked(searchEanByName);
const mockLookupCipBdpm = vi.mocked(lookupCipBdpm);

beforeEach(() => {
    mockFetchEanData.mockReset();
    mockSearchEanByName.mockReset();
    mockLookupCipBdpm.mockReset();
});

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
        expect(mockFetchEanData).not.toHaveBeenCalled();
        expect(mockSearchEanByName).not.toHaveBeenCalled();
    });

    it("EAN avec lettres → score 0, ne tente même pas le reverse si name absent", async () => {
        const out = await runCascade({ ean: "123ABC456789X" });
        expect(out.score).toBe(0);
        expect(out.tiers_matched).toEqual([]);
        expect(mockFetchEanData).not.toHaveBeenCalled();
    });

    it("Aucun input → score 0, masked", async () => {
        const out = await runCascade({});
        expect(out.score).toBe(0);
        expect(out.review_status).toBe("masked");
        expect(out.visible).toBe(false);
    });
});

describe("runCascade — cascade EAN valide", () => {
    it("EAN-13 valide + fetchEanData retourne open_beauty_facts → tier2_obf score 0.97", async () => {
        mockFetchEanData.mockResolvedValueOnce({
            name: "Coca-Cola Original 33cl",
            brand: "Coca-Cola",
            photo_url: null,
            category: "boisson",
            source: "open_beauty_facts",
        });
        // 5449000000996 = vrai EAN-13 Coca, checksum valide
        const out = await runCascade({ ean: "5449000000996" });
        expect(out.score).toBe(0.97);
        expect(out.tiers_matched).toEqual(["tier2_obf"]);
        expect(out.canonical_ean).toBe("5449000000996");
        expect(out.canonical_name).toBe("Coca-Cola Original 33cl");
        expect(out.review_status).toBe("validated");
        expect(out.visible).toBe(true);
    });

    it("EAN-13 valide + fetchEanData retourne open_products_facts → tier2_icecat 0.97", async () => {
        mockFetchEanData.mockResolvedValueOnce({
            name: "Sony WH-1000XM5 Black",
            brand: "Sony",
            photo_url: null,
            category: "headphones",
            source: "open_products_facts",
        });
        const out = await runCascade({ ean: "4548736133662" });
        expect(out.score).toBe(0.97);
        expect(out.tiers_matched).toEqual(["tier2_icecat"]);
    });

    it("EAN-13 valide + fetchEanData retourne ean_search → tier6 0.90 (pending queue)", async () => {
        mockFetchEanData.mockResolvedValueOnce({
            name: "Ray-Ban Wayfarer Classic Black",
            brand: null,
            photo_url: null,
            category: null,
            source: "ean_search",
        });
        const out = await runCascade({ ean: "8056597144056" });
        expect(out.score).toBe(0.9);
        expect(out.tiers_matched).toEqual(["tier6_eansearch"]);
        expect(out.review_status).toBe("pending");
        expect(out.visible).toBe(false);
    });

    it("Cache hit → tier6 (conservatif puisqu'on perd le tier originel)", async () => {
        mockFetchEanData.mockResolvedValueOnce({
            name: "Adidas Stan Smith",
            brand: "Adidas",
            photo_url: null,
            category: null,
            source: "cache",
        });
        const out = await runCascade({ ean: "4055017461258" });
        expect(out.tiers_matched).toEqual(["tier6_eansearch"]);
    });

    it("EAN valide + fetchEanData retourne null → fallback reverse search activé", async () => {
        mockFetchEanData.mockResolvedValueOnce(null);
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
        expect(mockFetchEanData).not.toHaveBeenCalled();
    });

    it("CIP-13 valide MAIS BDPM API down → fallback cascade Tier 2/6", async () => {
        mockLookupCipBdpm.mockResolvedValueOnce(null);
        mockFetchEanData.mockResolvedValueOnce({
            name: "DOLIPRANE 1000 mg",
            brand: null,
            photo_url: null,
            category: null,
            source: "ean_search",
        });
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
