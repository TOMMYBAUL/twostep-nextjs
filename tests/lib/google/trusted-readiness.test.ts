import { describe, expect, it } from "vitest";
import {
    DAILY_FEED_MAX_AGE_HOURS,
    TRUSTED_MIN_VERIFIED_MERCHANTS,
    evaluateTrustedDossier,
    evaluateTrustedMerchant,
    type TrustedMerchantInput,
} from "@/lib/google/trusted-readiness";

// Horloge injectée (convention repo : jamais Date.now() dans une lib pure).
const NOW = Date.parse("2026-07-10T12:00:00.000Z");
const HOUR = 3_600_000;

function readyInput(overrides: Partial<TrustedMerchantInput> = {}): TrustedMerchantInput {
    return {
        merchantId: "m-1",
        name: "Deerskin",
        publishable: 25,
        googleConnected: true,
        lastFeedAt: new Date(NOW - 2 * HOUR).toISOString(),
        lastFeedStatus: "success",
        attested: {
            gbpVerified: true,
            gbpLinkedToMc: true,
            inventoryVerificationRequested: true,
        },
        ...overrides,
    };
}

describe("evaluateTrustedMerchant", () => {
    it("marchand complet → prêt, zéro blocker", () => {
        const r = evaluateTrustedMerchant(readyInput(), NOW);
        expect(r.trustedReady).toBe(true);
        expect(r.blockers).toEqual([]);
        expect(r.dailyFeedOk).toBe(true);
        expect(r.feed.feedReady).toBe(true);
        expect(r.merchantId).toBe("m-1");
        expect(r.name).toBe("Deerskin");
    });

    it("offres sous le seuil LFP → below_offer_threshold propagé (source unique pilot-readiness)", () => {
        const r = evaluateTrustedMerchant(readyInput({ publishable: 7 }), NOW);
        expect(r.trustedReady).toBe(false);
        expect(r.blockers).toContain("below_offer_threshold");
        expect(r.feed.offerShortfall).toBe(4);
    });

    it("non connecté à Google → google_not_connected", () => {
        const r = evaluateTrustedMerchant(readyInput({ googleConnected: false }), NOW);
        expect(r.blockers).toContain("google_not_connected");
        expect(r.trustedReady).toBe(false);
    });

    it("jamais de feed poussé (lastFeedAt null) → feed_never_pushed SEUL (pas de double peine statut)", () => {
        const r = evaluateTrustedMerchant(
            readyInput({ lastFeedAt: null, lastFeedStatus: "pending" }),
            NOW,
        );
        expect(r.blockers).toContain("feed_never_pushed");
        expect(r.blockers).not.toContain("last_feed_not_success");
        expect(r.blockers).not.toContain("feed_not_daily");
        expect(r.dailyFeedOk).toBe(false);
    });

    it("feed frais mais statut 'partial' → last_feed_not_success (un push incomplet ≠ feed quotidien sain)", () => {
        const r = evaluateTrustedMerchant(readyInput({ lastFeedStatus: "partial" }), NOW);
        expect(r.blockers).toContain("last_feed_not_success");
        expect(r.dailyFeedOk).toBe(false);
    });

    it("feed frais mais statut 'error' → last_feed_not_success", () => {
        const r = evaluateTrustedMerchant(readyInput({ lastFeedStatus: "error" }), NOW);
        expect(r.blockers).toContain("last_feed_not_success");
    });

    it("feed 'success' mais plus vieux que la fenêtre → feed_not_daily", () => {
        const r = evaluateTrustedMerchant(
            readyInput({ lastFeedAt: new Date(NOW - (DAILY_FEED_MAX_AGE_HOURS + 1) * HOUR).toISOString() }),
            NOW,
        );
        expect(r.blockers).toContain("feed_not_daily");
        expect(r.dailyFeedOk).toBe(false);
    });

    it("borne exacte de la fenêtre → encore OK (âge <= max)", () => {
        const r = evaluateTrustedMerchant(
            readyInput({ lastFeedAt: new Date(NOW - DAILY_FEED_MAX_AGE_HOURS * HOUR).toISOString() }),
            NOW,
        );
        expect(r.dailyFeedOk).toBe(true);
        expect(r.blockers).toEqual([]);
    });

    it("timestamp PostgREST '+00:00' parsé en EPOCH (LESSON : jamais de comparaison de chaînes)", () => {
        const iso = new Date(NOW - 2 * HOUR).toISOString().replace("Z", "+00:00");
        const r = evaluateTrustedMerchant(readyInput({ lastFeedAt: iso }), NOW);
        expect(r.dailyFeedOk).toBe(true);
    });

    it("timestamp illisible → fail-closed feed_timestamp_invalid (jamais « prêt » sur donnée corrompue)", () => {
        const r = evaluateTrustedMerchant(readyInput({ lastFeedAt: "n/a" }), NOW);
        expect(r.blockers).toContain("feed_timestamp_invalid");
        expect(r.trustedReady).toBe(false);
    });

    it("timestamp légèrement futur (skew horloge ≤ tolérance) → toléré, pas de blocker", () => {
        const r = evaluateTrustedMerchant(
            readyInput({ lastFeedAt: new Date(NOW + 5 * 60_000).toISOString() }),
            NOW,
        );
        expect(r.dailyFeedOk).toBe(true);
    });

    it("timestamp TRÈS futur (+1 an, donnée corrompue) → feed_timestamp_invalid, jamais « frais » (revue SF-hunter)", () => {
        const r = evaluateTrustedMerchant(
            readyInput({ lastFeedAt: new Date(NOW + 365 * 24 * HOUR).toISOString() }),
            NOW,
        );
        expect(r.blockers).toContain("feed_timestamp_invalid");
        expect(r.dailyFeedOk).toBe(false);
        expect(r.trustedReady).toBe(false);
    });

    it("chaque attestation externe manquante → son blocker dédié, ordre stable", () => {
        const r = evaluateTrustedMerchant(
            readyInput({
                attested: { gbpVerified: false, gbpLinkedToMc: false, inventoryVerificationRequested: false },
            }),
            NOW,
        );
        expect(r.blockers).toEqual([
            "gbp_not_verified",
            "gbp_not_linked_to_mc",
            "inventory_verification_not_requested",
        ]);
        expect(r.trustedReady).toBe(false);
    });

    it("attestation non-booléenne (donnée sale) → fail-closed comme false", () => {
        const r = evaluateTrustedMerchant(
            readyInput({
                attested: {
                    gbpVerified: "oui" as unknown as boolean,
                    gbpLinkedToMc: true,
                    inventoryVerificationRequested: true,
                },
            }),
            NOW,
        );
        expect(r.blockers).toContain("gbp_not_verified");
    });

    it("objet attested ABSENT (JSON non typé) → les 3 blockers, jamais un crash ni un « prêt »", () => {
        const r = evaluateTrustedMerchant(
            readyInput({ attested: undefined as unknown as TrustedMerchantInput["attested"] }),
            NOW,
        );
        expect(r.blockers).toEqual(
            expect.arrayContaining([
                "gbp_not_verified",
                "gbp_not_linked_to_mc",
                "inventory_verification_not_requested",
            ]),
        );
        expect(r.trustedReady).toBe(false);
    });
});

describe("evaluateTrustedDossier", () => {
    it("5 marchands prêts → Trusted éligible, shortfall 0", () => {
        const inputs = Array.from({ length: 5 }, (_, i) =>
            readyInput({ merchantId: `m-${i}`, name: `Boutique ${i}` }),
        );
        const d = evaluateTrustedDossier(inputs, NOW);
        expect(d.readyCount).toBe(5);
        expect(d.threshold).toBe(TRUSTED_MIN_VERIFIED_MERCHANTS);
        expect(d.shortfall).toBe(0);
        expect(d.trustedEligible).toBe(true);
        expect(d.merchants).toHaveLength(5);
    });

    it("4 prêts + 1 bloqué → pas éligible, shortfall 1", () => {
        const inputs = [
            ...Array.from({ length: 4 }, (_, i) => readyInput({ merchantId: `m-${i}` })),
            readyInput({ merchantId: "m-late", publishable: 3 }),
        ];
        const d = evaluateTrustedDossier(inputs, NOW);
        expect(d.readyCount).toBe(4);
        expect(d.shortfall).toBe(1);
        expect(d.trustedEligible).toBe(false);
    });

    it("doublon de merchantId → compté UNE fois (un KPI qui surévalue = faux positif)", () => {
        const d = evaluateTrustedDossier(
            [readyInput({ merchantId: "dup" }), readyInput({ merchantId: "dup" })],
            NOW,
        );
        expect(d.merchants).toHaveLength(1);
        expect(d.readyCount).toBe(1);
        expect(d.shortfall).toBe(TRUSTED_MIN_VERIFIED_MERCHANTS - 1);
    });

    it("doublons DIVERGENTS : ligne « prête » périmée D'ABORD, état réel cassé ensuite → le PIRE gagne (revue SF-hunter)", () => {
        const d = evaluateTrustedDossier(
            [
                readyInput({ merchantId: "dup" }),
                readyInput({ merchantId: "dup", googleConnected: false }),
            ],
            NOW,
        );
        expect(d.merchants).toHaveLength(1);
        expect(d.readyCount).toBe(0);
        expect(d.merchants[0].blockers).toContain("google_not_connected");
        expect(d.trustedEligible).toBe(false);
    });

    it("doublons DIVERGENTS dans l'autre ordre (cassé d'abord) → toujours le pire", () => {
        const d = evaluateTrustedDossier(
            [
                readyInput({ merchantId: "dup", publishable: 2 }),
                readyInput({ merchantId: "dup" }),
            ],
            NOW,
        );
        expect(d.readyCount).toBe(0);
        expect(d.merchants[0].blockers).toContain("below_offer_threshold");
    });

    it("liste vide → 0 prêt, shortfall = seuil, jamais négatif", () => {
        const d = evaluateTrustedDossier([], NOW);
        expect(d.readyCount).toBe(0);
        expect(d.shortfall).toBe(TRUSTED_MIN_VERIFIED_MERCHANTS);
        expect(d.trustedEligible).toBe(false);
    });
});
