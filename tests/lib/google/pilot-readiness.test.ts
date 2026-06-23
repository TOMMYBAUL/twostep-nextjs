import { describe, it, expect } from "vitest";
import {
    evaluateFeedReadiness,
    LFP_MIN_PUBLISHABLE_OFFERS,
    type FeedReadinessInput,
} from "@/lib/google/pilot-readiness";

/**
 * Item READINESS (`docs/autonomy-priorities.md`) — readiness LFP SOFTWARE rendue PROGRAMMATIQUE.
 *
 * North-star §1 : « prêt pour les marchands » doit être un signal VÉRIFIABLE, pas un comptage
 * manuel. Le seuil LFP « ≥ 11 offres publiables » ne vivait que dans la prose ; ici il devient
 * un invariant testé + une source unique (`LFP_MIN_PUBLISHABLE_OFFERS`).
 *
 * Méthode §1bis : sortie inspectée champ par champ (pas juste « ça compile »), sur des entrées
 * aux bords (seuil exact, sous le seuil, négatif/NaN, déconnecté).
 */
describe("READINESS — evaluateFeedReadiness (fonction pure, champ par champ)", () => {
    const input = (p: Partial<FeedReadinessInput>): FeedReadinessInput => ({
        publishable: 20,
        googleConnected: true,
        ...p,
    });

    it("le seuil LFP est 11 (source unique, anti-divergence prose↔code)", () => {
        expect(LFP_MIN_PUBLISHABLE_OFFERS).toBe(11);
    });

    it("marchand prêt : ≥ 11 offres ET connecté → feedReady, 0 blocker, shortfall 0", () => {
        const r = evaluateFeedReadiness(input({ publishable: 15, googleConnected: true }));
        expect(r).toEqual({
            publishable: 15,
            threshold: 11,
            meetsOfferThreshold: true,
            offerShortfall: 0,
            googleConnected: true,
            feedReady: true,
            blockers: [],
        });
    });

    it("au seuil EXACT (11) → atteint, shortfall 0 (>= et non >)", () => {
        const r = evaluateFeedReadiness(input({ publishable: 11 }));
        expect(r.meetsOfferThreshold).toBe(true);
        expect(r.offerShortfall).toBe(0);
    });

    it("juste SOUS le seuil (10) → non atteint, shortfall 1, blocker below_offer_threshold", () => {
        const r = evaluateFeedReadiness(input({ publishable: 10, googleConnected: true }));
        expect(r.meetsOfferThreshold).toBe(false);
        expect(r.offerShortfall).toBe(1);
        expect(r.feedReady).toBe(false);
        expect(r.blockers).toEqual(["below_offer_threshold"]);
    });

    it("0 offre → shortfall = seuil entier (11), pas négatif", () => {
        const r = evaluateFeedReadiness(input({ publishable: 0, googleConnected: true }));
        expect(r.offerShortfall).toBe(11);
        expect(r.blockers).toEqual(["below_offer_threshold"]);
    });

    it("assez d'offres mais NON connecté → pas prêt, blocker google_not_connected seul", () => {
        const r = evaluateFeedReadiness(input({ publishable: 50, googleConnected: false }));
        expect(r.meetsOfferThreshold).toBe(true);
        expect(r.feedReady).toBe(false);
        expect(r.blockers).toEqual(["google_not_connected"]);
    });

    it("ni offres ni connexion → deux blockers, ordre stable (offres puis connexion)", () => {
        const r = evaluateFeedReadiness(input({ publishable: 3, googleConnected: false }));
        expect(r.feedReady).toBe(false);
        expect(r.blockers).toEqual(["below_offer_threshold", "google_not_connected"]);
    });

    it("compte d'offres NÉGATIF (bug appelant) normalisé à 0 — jamais publiable, shortfall 11", () => {
        const r = evaluateFeedReadiness(input({ publishable: -5, googleConnected: true }));
        expect(r.publishable).toBe(0);
        expect(r.meetsOfferThreshold).toBe(false);
        expect(r.offerShortfall).toBe(11);
    });

    it("compte d'offres NaN (bug appelant) normalisé à 0 — pas de NaN propagé dans shortfall", () => {
        const r = evaluateFeedReadiness(input({ publishable: Number.NaN, googleConnected: true }));
        expect(r.publishable).toBe(0);
        expect(Number.isNaN(r.offerShortfall)).toBe(false);
        expect(r.offerShortfall).toBe(11);
    });

    it("compte fractionnaire tronqué vers le bas (12.9 → 12, reste ≥ 11)", () => {
        const r = evaluateFeedReadiness(input({ publishable: 12.9, googleConnected: true }));
        expect(r.publishable).toBe(12);
        expect(r.meetsOfferThreshold).toBe(true);
    });

    it("googleConnected truthy non-booléen ne passe pas pour `true` (=== true strict)", () => {
        // Sécurité : un appelant qui passe une valeur tronquée ne doit pas être lu « connecté ».
        const r = evaluateFeedReadiness({ publishable: 20, googleConnected: 1 as unknown as boolean });
        expect(r.googleConnected).toBe(false);
        expect(r.blockers).toContain("google_not_connected");
    });
});
