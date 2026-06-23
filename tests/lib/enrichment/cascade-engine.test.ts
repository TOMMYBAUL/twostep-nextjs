import { describe, it, expect, vi, beforeEach } from "vitest";
import { preflightEan, runCascade } from "@/lib/enrichment/cascade-engine";

// Cycle 4 : on mock désormais `collectAllEanSources` au lieu de `fetchEanData`
// pour refléter le refactor multi-source convergence.
// On mocke `searchEanByName` (appel réseau) mais on garde le VRAI `scoreNameMatch`
// (fonction pure) pour que la garde de concordance D7 soit réellement exercée.
vi.mock("@/lib/ean/lookup", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/ean/lookup")>();
    return {
        ...actual,
        searchEanByName: vi.fn(),
    };
});

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

    it("Sprint 1.5 — EAN valide d'entrée + aucune source : PAS de reverse search (anti-faux-positif)", async () => {
        mockCollectAll.mockResolvedValueOnce(multi([], null));
        // searchEanByName ne devrait PAS être appelée car input.ean est fourni.
        // Avant Sprint 1.5 : tier6_eansearch acceptait un EAN remplacé par
        // reverse search par name → faux positif catastrophique (cf bug
        // Nike/Weleda 29/04). Maintenant on garde l'EAN d'entrée intact.
        const out = await runCascade({
            ean: "4055017461258",
            name: "Adidas Stan Smith Originals",
            brand: "Adidas",
        });
        expect(out.tiers_matched).toEqual([]);
        expect(out.canonical_ean).toBeNull();
        expect(mockSearchEanByName).not.toHaveBeenCalled();
    });

    it("Sprint 1.5 — Pas d'EAN d'entrée + name → reverse search appelée", async () => {
        mockCollectAll.mockResolvedValueOnce(multi([], null));
        mockSearchEanByName.mockResolvedValueOnce({
            ean: "4055017461258",
            brand: "Adidas",
            category: "sneakers",
        });
        const out = await runCascade({
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

describe("runCascade — garde de concordance EAN↔nom-marchand (D7, zéro faux positif)", () => {
    it("EAN saisi résout un nom qui NE CONCORDE PAS avec le nom marchand → pending malgré tier2 0.97", async () => {
        // Cas réel : le marchand a tapé/réutilisé un mauvais code-barres. OBF résout
        // une identité RÉELLE mais FAUSSE (« Shampooing » pour une « Crème solaire »).
        // AVANT D7 : tier2_obf=0.97 ≥ 0.95 → validated + visible → identité fausse
        // publiée en confiance d'UNE seule source. APRÈS : review 1-tap obligatoire.
        mockCollectAll.mockResolvedValueOnce(
            multi(["tier2_obf"], "Shampooing Garnier Ultra Doux"),
        );
        const out = await runCascade({
            ean: "5449000000996",
            name: "Crème solaire Nivea SPF50",
            brand: "Nivea",
        });
        expect(out.score).toBe(0.97); // score brut conservé (traçabilité)
        expect(out.canonical_name).toBe("Shampooing Garnier Ultra Doux");
        expect(out.review_status).toBe("pending"); // ← le garde : pas d'auto-publish
        expect(out.visible).toBe(false);
    });

    it("EAN saisi résout un nom CONCORDANT avec le nom marchand → validated/visible (non-régression)", async () => {
        mockCollectAll.mockResolvedValueOnce(
            multi(["tier2_obf"], "Coca-Cola Original Taste 33cl"),
        );
        const out = await runCascade({
            ean: "5449000000996",
            name: "Coca-Cola 33cl",
        });
        expect(out.score).toBe(0.97);
        expect(out.review_status).toBe("validated");
        expect(out.visible).toBe(true);
    });

    it("nom marchand terse mais cohérent → concorde (pas de faux downgrade)", async () => {
        // Garde-fou anti-friction : un nom court ne doit pas tomber en review s'il
        // décrit bien le produit (poids du recouvrement de mots dans scoreNameMatch).
        mockCollectAll.mockResolvedValueOnce(
            multi(["tier2_obf"], "Crème hydratante BioDerm 50ml"),
        );
        const out = await runCascade({
            ean: "5449000000996",
            name: "Crème hydratante",
        });
        expect(out.review_status).toBe("validated");
        expect(out.visible).toBe(true);
    });

    it("aucun nom marchand fourni → garde inerte (non évaluable), comportement historique", async () => {
        // Chemin POS/fichier EAN-seul : on ne peut pas croiser → on garde le score brut.
        mockCollectAll.mockResolvedValueOnce(multi(["tier2_obf"], "Coca-Cola Original 33cl"));
        const out = await runCascade({ ean: "5449000000996" });
        expect(out.review_status).toBe("validated");
        expect(out.visible).toBe(true);
    });

    it("CIP-13 médicament : nom marchand divergent du nom BDPM → pending malgré tier1_cip 0.99 (cas le plus dangereux)", async () => {
        // Un CIP mal saisi mais valide+présent dans BDPM résout un AUTRE médicament.
        // La garde D7 doit s'appliquer AUSSI sur l'early return CIP (sinon 0.99 auto-publish).
        mockLookupCipBdpm.mockResolvedValueOnce({
            canonical_name: "DOLIPRANE 1000 mg, comprimé",
            brand: "SANOFI",
            category: "comprimé",
            sectorial_id: "3400933264963",
            source: "tier1_cip_bdpm",
        });
        const out = await runCascade({
            ean: "3400933264963",
            name: "Smecta poudre suspension buvable",
        });
        expect(out.score).toBe(0.99);
        expect(out.tiers_matched).toEqual(["tier1_cip"]);
        expect(out.review_status).toBe("pending"); // ← garde appliquée sur le chemin CIP
        expect(out.visible).toBe(false);
    });

    it("CIP-13 : nom marchand concordant avec BDPM → validated (non-régression)", async () => {
        mockLookupCipBdpm.mockResolvedValueOnce({
            canonical_name: "DOLIPRANE 1000 mg, comprimé",
            brand: "SANOFI",
            category: "comprimé",
            sectorial_id: "3400933264963",
            source: "tier1_cip_bdpm",
        });
        const out = await runCascade({
            ean: "3400933264963",
            name: "Doliprane 1000mg comprimé",
        });
        expect(out.review_status).toBe("validated");
        expect(out.visible).toBe(true);
    });

    it("convergence 2 tiers (boost) : nom canonique divergent du nom marchand → pending malgré 0.985", async () => {
        // Le boost de convergence ne doit pas court-circuiter la garde : même à 0.985,
        // si le nom résolu (le plus long via pickCanonicalName) ne concorde pas → review.
        mockCollectAll.mockResolvedValueOnce(
            multi(["tier2_obf", "tier6_eansearch"], "Parfum Dior Sauvage EDT 100ml"),
        );
        const out = await runCascade({
            ean: "5449000000996",
            name: "Lessive Ariel Pods 38 capsules",
        });
        expect(out.score).toBeCloseTo(0.985, 3);
        expect(out.review_status).toBe("pending");
        expect(out.visible).toBe(false);
    });

    it("source ne résout aucun nom (canonical_name null) → garde inerte, score décide seul", async () => {
        // tier6 seul, sans nom canonique → 0.90 → pending par le SCORE, pas par le garde.
        mockCollectAll.mockResolvedValueOnce(multi(["tier6_eansearch"], null));
        const out = await runCascade({
            ean: "5449000000996",
            name: "Un produit quelconque très différent",
        });
        expect(out.score).toBe(0.9);
        expect(out.review_status).toBe("pending");
    });
});
