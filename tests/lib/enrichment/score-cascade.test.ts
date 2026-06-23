import { describe, it, expect } from "vitest";
import {
    buildCascadeOutcome,
    combineTierScores,
    scoreToReviewStatus,
    scoreToVisible,
    SCORE_THRESHOLDS,
    TIER_SCORES,
} from "@/lib/enrichment/score-cascade";

describe("TIER_SCORES — alignment avec brain Socle-identification-cascade", () => {
    it("tier1 (ISBN/CIP/GTIN) = 0.99", () => {
        expect(TIER_SCORES.tier1_isbn).toBe(0.99);
        expect(TIER_SCORES.tier1_cip).toBe(0.99);
        expect(TIER_SCORES.tier1_gtin_validated).toBe(0.99);
    });
    it("tier2 (Open Facts) = 0.97", () => {
        expect(TIER_SCORES.tier2_off).toBe(0.97);
        expect(TIER_SCORES.tier2_obf).toBe(0.97);
        expect(TIER_SCORES.tier2_icecat).toBe(0.97);
    });
    it("tier3 (Google Product Catalog) = 0.95 (juste sur le seuil auto-publish)", () => {
        expect(TIER_SCORES.tier3_google_pc).toBe(0.95);
    });
    it("tier4 (CLIP) = 0.92", () => {
        expect(TIER_SCORES.tier4_clip).toBe(0.92);
    });
    it("tier5 (BERT) = 0.85", () => {
        expect(TIER_SCORES.tier5_bert).toBe(0.85);
    });
    it("tier6 (EAN-Search) = 0.90", () => {
        expect(TIER_SCORES.tier6_eansearch).toBe(0.9);
    });
});

describe("combineTierScores", () => {
    it("returns 0 if no tier matched", () => {
        expect(combineTierScores([])).toBe(0);
    });
    it("returns the nominal score for a single tier", () => {
        expect(combineTierScores(["tier3_google_pc"])).toBe(0.95);
        expect(combineTierScores(["tier6_eansearch"])).toBe(0.9);
    });
    it("returns max + boost when 2 tiers converge", () => {
        // max(0.95, 0.90) + 1×0.015 = 0.965
        expect(combineTierScores(["tier3_google_pc", "tier6_eansearch"]))
            .toBeCloseTo(0.965, 3);
    });
    it("3 tiers converging push above 0.95 even without ISBN/CIP", () => {
        // tier3 0.95 + tier4 0.92 + tier6 0.90 → max 0.95 + 2×0.015 = 0.98
        const score = combineTierScores([
            "tier3_google_pc",
            "tier4_clip",
            "tier6_eansearch",
        ]);
        expect(score).toBeCloseTo(0.98, 3);
        expect(score).toBeGreaterThanOrEqual(SCORE_THRESHOLDS.auto_publish);
    });
    it("caps boost at +0.05 even with many tiers", () => {
        const score = combineTierScores([
            "tier1_isbn",
            "tier2_off",
            "tier2_obf",
            "tier3_google_pc",
            "tier4_clip",
            "tier6_eansearch",
        ]);
        // max=0.99, +5×0.015 = +0.075 mais capé à +0.05 → 1.04, capé à 0.999
        expect(score).toBeLessThanOrEqual(0.999);
        expect(score).toBeGreaterThanOrEqual(0.99);
    });
    it("never exceeds 0.999 (no auto-promote to 1.000)", () => {
        expect(combineTierScores(["tier1_isbn"])).toBeLessThanOrEqual(0.999);
    });
});

describe("scoreToReviewStatus", () => {
    it("≥ 0.95 → validated", () => {
        expect(scoreToReviewStatus(0.95)).toBe("validated");
        expect(scoreToReviewStatus(0.99)).toBe("validated");
        expect(scoreToReviewStatus(1)).toBe("validated");
    });
    it("0.70-0.95 → pending (queue 1-tap)", () => {
        expect(scoreToReviewStatus(0.7)).toBe("pending");
        expect(scoreToReviewStatus(0.85)).toBe("pending");
        expect(scoreToReviewStatus(0.949)).toBe("pending");
    });
    it("< 0.70 → masked", () => {
        expect(scoreToReviewStatus(0)).toBe("masked");
        expect(scoreToReviewStatus(0.5)).toBe("masked");
        expect(scoreToReviewStatus(0.699)).toBe("masked");
    });
    it("null/undefined → masked (état initial avant cascade)", () => {
        expect(scoreToReviewStatus(null)).toBe("masked");
        expect(scoreToReviewStatus(undefined)).toBe("masked");
    });
});

describe("scoreToVisible", () => {
    it("only ≥ 0.95 produces visible=true", () => {
        expect(scoreToVisible(0.95)).toBe(true);
        expect(scoreToVisible(0.94)).toBe(false);
        expect(scoreToVisible(0.7)).toBe(false);
        expect(scoreToVisible(null)).toBe(false);
    });
});

describe("buildCascadeOutcome", () => {
    it("aggregates score + status + visible from tiers", () => {
        const out = buildCascadeOutcome(
            ["tier2_off"],
            "5449000000996",
            "Coca-Cola Original Taste 33cl",
        );
        expect(out.score).toBe(0.97);
        expect(out.review_status).toBe("validated");
        expect(out.visible).toBe(true);
        expect(out.canonical_ean).toBe("5449000000996");
        expect(out.tiers_matched).toEqual(["tier2_off"]);
    });

    it("a single tier6 fallback puts the product en queue (0.90 < 0.95)", () => {
        const out = buildCascadeOutcome(
            ["tier6_eansearch"],
            "1234567890123",
            null,
        );
        expect(out.score).toBe(0.9);
        expect(out.review_status).toBe("pending");
        expect(out.visible).toBe(false);
    });

    it("empty tiers → masked + score 0", () => {
        const out = buildCascadeOutcome([], null, null);
        expect(out.score).toBe(0);
        expect(out.review_status).toBe("masked");
        expect(out.visible).toBe(false);
        expect(out.canonical_ean).toBeNull();
    });

    it("convergence 2 tiers → boost franchit 0.95 même si max < 0.95", () => {
        // max=0.92, +1×0.015 = 0.935 → still pending (0.92 max + 0.015 = 0.935)
        const out = buildCascadeOutcome(
            ["tier4_clip", "tier6_eansearch"],
            "1234567890123",
            null,
        );
        // max(0.92,0.90)=0.92 + 0.015 = 0.935 → pending
        expect(out.score).toBeCloseTo(0.935, 3);
        expect(out.review_status).toBe("pending");
    });
});

describe("buildCascadeOutcome — garde de concordance d'identité (D7)", () => {
    it("identityConcords=false sur un score auto-publish → rétrograde validated→pending, visible false", () => {
        // tier2_obf = 0.97 → normalement validated/visible. La divergence de nom
        // (EAN mal saisi → identité fausse) force la review 1-tap, jamais l'auto-publish.
        const out = buildCascadeOutcome(["tier2_obf"], "5449000000996", "Shampooing X", {
            identityConcords: false,
        });
        expect(out.score).toBe(0.97); // le score brut n'est PAS altéré (traçabilité)
        expect(out.review_status).toBe("pending");
        expect(out.visible).toBe(false);
    });

    it("identityConcords=true → aucun downgrade (validated/visible conservés)", () => {
        const out = buildCascadeOutcome(["tier2_obf"], "5449000000996", "Coca-Cola", {
            identityConcords: true,
        });
        expect(out.review_status).toBe("validated");
        expect(out.visible).toBe(true);
    });

    it("identityConcords=undefined → comportement historique inchangé (non évaluable)", () => {
        const out = buildCascadeOutcome(["tier2_obf"], "5449000000996", "Coca-Cola");
        expect(out.review_status).toBe("validated");
        expect(out.visible).toBe(true);
    });

    it("identityConcords=false NE remonte PAS un score déjà sous le seuil (pending reste pending)", () => {
        // tier6 = 0.90 → déjà pending : la garde ne doit ni l'aggraver ni le toucher.
        const out = buildCascadeOutcome(["tier6_eansearch"], "1234567890123", "X", {
            identityConcords: false,
        });
        expect(out.review_status).toBe("pending");
        expect(out.visible).toBe(false);
    });
});
