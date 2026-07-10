import { describe, expect, it } from "vitest";
import {
    deriveStatsView,
    deriveConnectionView,
    deriveReadinessView,
    deriveSlaHistoryView,
    type GoogleStatsData,
    type GoogleConnectionData,
} from "@/lib/google/dashboard-view";

const baseStats: GoogleStatsData = {
    total_visible: 12,
    eligible_google: 9,
    missing_ean: 0,
    missing_photo: 0,
    missing_price: 0,
    score: 75,
    blocked_only_by_image: 0,
    lfp_offers_threshold: 11,
    lfp_meets_offer_threshold: false,
    lfp_offer_shortfall: 2,
    google_connected: false,
    lfp_feed_ready: false,
};

const baseConnection: GoogleConnectionData = {
    google_merchant_id: "123456",
    products_pushed: 9,
    last_feed_at: "2026-06-24T08:00:00.000Z",
    last_feed_status: "success",
    last_feed_error: null,
    store_code: "twostep-abcd1234",
};

describe("deriveStatsView — honnêteté du chargement (north-star)", () => {
    it("HTTP !ok → error (jamais un faux « catalogue vide »)", () => {
        // Régression : la page ignorait le statut HTTP → un 500 affichait un état OK silencieux.
        expect(deriveStatsView({ ok: false, stats: null })).toEqual({ kind: "error" });
    });

    it("ok mais stats null (corps inattendu) → error, pas empty", () => {
        expect(deriveStatsView({ ok: true, stats: null })).toEqual({ kind: "error" });
    });

    it("ok avec 0 produit visible → empty (guidage import), pas error", () => {
        const view = deriveStatsView({ ok: true, stats: { ...baseStats, total_visible: 0, eligible_google: 0, score: 0 } });
        expect(view).toEqual({ kind: "empty" });
    });

    it("total_visible négatif (donnée aberrante) → empty, jamais un score", () => {
        expect(deriveStatsView({ ok: true, stats: { ...baseStats, total_visible: -1 } }).kind).toBe("empty");
    });

    it("ok avec produits → stats avec score/éligibles/total", () => {
        const view = deriveStatsView({ ok: true, stats: baseStats });
        expect(view).toMatchObject({ kind: "stats", score: 75, eligible: 9, total: 12 });
    });
});

describe("deriveStatsView — suggestions actionnables", () => {
    it("aucun manque → 0 suggestion", () => {
        const view = deriveStatsView({ ok: true, stats: baseStats });
        expect(view.kind === "stats" && view.suggestions).toEqual([]);
    });

    it("photo manquante → suggestion ton warning", () => {
        const view = deriveStatsView({ ok: true, stats: { ...baseStats, missing_photo: 3 } });
        expect(view.kind === "stats" && view.suggestions).toEqual([
            { count: 3, label: expect.stringContaining("photo"), tone: "warning" },
        ]);
    });

    it("code-barres manquant → suggestion ton error (bloquant)", () => {
        const view = deriveStatsView({ ok: true, stats: { ...baseStats, missing_ean: 2 } });
        expect(view.kind === "stats" && view.suggestions[0]).toMatchObject({ count: 2, tone: "error" });
    });

    it("ordre stable : photo, puis code-barres, puis prix", () => {
        const view = deriveStatsView({ ok: true, stats: { ...baseStats, missing_photo: 1, missing_ean: 1, missing_price: 1 } });
        const labels = view.kind === "stats" ? view.suggestions.map((s) => s.label) : [];
        expect(labels[0]).toContain("photo");
        expect(labels[1]).toContain("code-barres");
        expect(labels[2]).toContain("prix");
    });

    it("compteur à 0 → pas de suggestion (jamais « +0 »)", () => {
        const view = deriveStatsView({ ok: true, stats: { ...baseStats, missing_photo: 0, missing_price: 0 } });
        expect(view.kind === "stats" && view.suggestions).toEqual([]);
    });
});

describe("deriveReadinessView — signal go-live LFP (verdict serveur, pas recalculé client)", () => {
    it("chargement échoué → hidden (l'état error est rendu par deriveStatsView)", () => {
        expect(deriveReadinessView({ ok: false, stats: null })).toEqual({ kind: "hidden" });
        expect(deriveReadinessView({ ok: true, stats: null })).toEqual({ kind: "hidden" });
    });

    it("catalogue vide → hidden (pas de double message avec le CTA import)", () => {
        const view = deriveReadinessView({ ok: true, stats: { ...baseStats, total_visible: 0 } });
        expect(view).toEqual({ kind: "hidden" });
    });

    it("lfp_feed_ready=true → ready avec le nombre d'offres publiables", () => {
        const view = deriveReadinessView({
            ok: true,
            stats: { ...baseStats, lfp_feed_ready: true, lfp_meets_offer_threshold: true, google_connected: true, eligible_google: 14 },
        });
        expect(view).toEqual({ kind: "ready", publishable: 14 });
    });

    it("lfp_feed_ready=true mais eligible_google incohérent (0) → publishable null (jamais « 0 offres »)", () => {
        const view = deriveReadinessView({
            ok: true,
            stats: { ...baseStats, lfp_feed_ready: true, lfp_meets_offer_threshold: true, google_connected: true, eligible_google: 0 },
        });
        expect(view).toEqual({ kind: "ready", publishable: null });
    });

    it("sous le seuil + non connecté → blocked, freins dans l'ordre (offres puis connexion)", () => {
        const view = deriveReadinessView({ ok: true, stats: { ...baseStats, lfp_offer_shortfall: 2 } });
        if (view.kind !== "blocked") throw new Error("expected blocked");
        expect(view.blockers.map((b) => b.code)).toEqual(["below_offer_threshold", "google_not_connected"]);
        expect(view.blockers[0].label).toContain("2 offres publiables");
        expect(view.blockers[0].label).toContain("11");
    });

    it("manque 1 offre → libellé au singulier (jamais « 1 offres »)", () => {
        const view = deriveReadinessView({ ok: true, stats: { ...baseStats, lfp_offer_shortfall: 1 } });
        if (view.kind !== "blocked") throw new Error("expected blocked");
        expect(view.blockers[0].label).toContain("1 offre publiable");
        expect(view.blockers[0].label).not.toContain("1 offres");
    });

    it("blocked_only_by_image>0 → hint actionnable « ne manque que d'une photo »", () => {
        const view = deriveReadinessView({ ok: true, stats: { ...baseStats, blocked_only_by_image: 3 } });
        if (view.kind !== "blocked") throw new Error("expected blocked");
        expect(view.blockers[0].hint).toContain("3 produits");
        expect(view.blockers[0].hint).toContain("photo");
    });

    it("blocked_only_by_image=0 → pas de hint (jamais « 0 produit »)", () => {
        const view = deriveReadinessView({ ok: true, stats: { ...baseStats, blocked_only_by_image: 0 } });
        if (view.kind !== "blocked") throw new Error("expected blocked");
        expect(view.blockers[0].hint).toBeUndefined();
    });

    it("seuil atteint mais NON connecté → seul frein = connexion", () => {
        const view = deriveReadinessView({
            ok: true,
            stats: { ...baseStats, lfp_meets_offer_threshold: true, lfp_offer_shortfall: 0, google_connected: false },
        });
        if (view.kind !== "blocked") throw new Error("expected blocked");
        expect(view.blockers.map((b) => b.code)).toEqual(["google_not_connected"]);
    });

    it("garde défensive : feed_ready=false sans frein identifié → ne renvoie jamais une liste vide", () => {
        // Contrat serveur incohérent (feed_ready=false alors que seuil ATTEINT ET connecté).
        const view = deriveReadinessView({
            ok: true,
            stats: { ...baseStats, lfp_meets_offer_threshold: true, lfp_offer_shortfall: 0, google_connected: true, lfp_feed_ready: false },
        });
        if (view.kind !== "blocked") throw new Error("expected blocked");
        expect(view.blockers.length).toBeGreaterThan(0);
    });
});

describe("deriveConnectionView — un blip de lecture ≠ « pas connecté »", () => {
    it("error de lecture → error (pas « disconnected » qui inviterait à reconnecter)", () => {
        // Régression : la page jetait l'error → blip affiché « pas connecté ».
        expect(deriveConnectionView({ error: true, connection: null })).toEqual({ kind: "error" });
    });

    it("error de lecture MÊME avec une connexion présente → error (prudent)", () => {
        expect(deriveConnectionView({ error: true, connection: baseConnection })).toEqual({ kind: "error" });
    });

    it("pas d'error, pas de ligne → disconnected (vraiment pas connecté)", () => {
        expect(deriveConnectionView({ error: false, connection: null })).toEqual({ kind: "disconnected" });
    });

    it("pas d'error, ligne présente → connected avec la connexion", () => {
        const view = deriveConnectionView({ error: false, connection: baseConnection });
        expect(view).toEqual({ kind: "connected", connection: baseConnection });
    });
});

describe("deriveStatsView — SLA fraîcheur (G1, champs additifs)", () => {
    it("champs fraîcheur présents → freshness rempli (score + numérateur/dénominateur)", () => {
        const view = deriveStatsView({
            ok: true,
            stats: { ...baseStats, in_stock: 8, publishable_in_stock: 6, fresh_available: 3, freshness_score: 50 },
        });
        expect(view).toMatchObject({ kind: "stats", freshness: { score: 50, fresh: 3, publishableInStock: 6 } });
    });

    it("champs absents (ancienne version serveur) → freshness null, JAMAIS un 0 % inventé", () => {
        const view = deriveStatsView({ ok: true, stats: baseStats });
        expect(view).toMatchObject({ kind: "stats", freshness: null });
    });

    it("champs non numériques (payload corrompu) → freshness null", () => {
        const view = deriveStatsView({
            ok: true,
            stats: { ...baseStats, freshness_score: NaN, fresh_available: 3, publishable_in_stock: 6 },
        });
        expect(view).toMatchObject({ kind: "stats", freshness: null });
    });

    it("0 offre publiable en stock → freshness PRÉSENT avec dénominateur 0 (l'UI affiche l'état neutre, pas 0 % rouge)", () => {
        const view = deriveStatsView({
            ok: true,
            stats: { ...baseStats, in_stock: 0, publishable_in_stock: 0, fresh_available: 0, freshness_score: 0 },
        });
        expect(view).toMatchObject({ kind: "stats", freshness: { score: 0, fresh: 0, publishableInStock: 0 } });
    });
});

describe("deriveSlaHistoryView — 4 états DISTINCTS (erreur ≠ pas activé ≠ vide)", () => {
    const day = (d: string, pub = 80, fresh = 60) => ({
        day: d,
        total: 10,
        publishable: 8,
        publishable_score: pub,
        in_stock: 7,
        publishable_in_stock: 6,
        fresh_available: 4,
        freshness_score: fresh,
    });

    it("fetch échoué / corps nul → error (jamais un faux « pas d'historique »)", () => {
        expect(deriveSlaHistoryView({ ok: false, body: null })).toEqual({ kind: "error" });
        expect(deriveSlaHistoryView({ ok: true, body: null })).toEqual({ kind: "error" });
    });

    it("available:false (migration 113 / flag pas actifs) → unavailable, PAS empty", () => {
        expect(deriveSlaHistoryView({ ok: true, body: { available: false, days: [] } })).toEqual({ kind: "unavailable" });
        // available absent (contrat inattendu) → prudence : unavailable, pas un historique vide affirmé.
        expect(deriveSlaHistoryView({ ok: true, body: {} })).toEqual({ kind: "unavailable" });
    });

    it("available:true + 0 jour → empty (vide RÉEL, distinct de unavailable)", () => {
        expect(deriveSlaHistoryView({ ok: true, body: { available: true, days: [] } })).toEqual({ kind: "empty" });
    });

    it("available:true + jours → history plafonné à 7, ordre serveur conservé", () => {
        const days = Array.from({ length: 10 }, (_, i) => day(`2026-07-${String(10 - i).padStart(2, "0")}`));
        const view = deriveSlaHistoryView({ ok: true, body: { available: true, days } });
        expect(view.kind).toBe("history");
        if (view.kind === "history") {
            expect(view.days).toHaveLength(7);
            expect(view.days[0].day).toBe("2026-07-10"); // plus récent en premier (ordre serveur desc)
            expect(view.days[6].day).toBe("2026-07-04");
        }
    });

    it("days non-tableau (contrat cassé) → empty prudent, pas un crash", () => {
        expect(
            deriveSlaHistoryView({ ok: true, body: { available: true, days: "oops" as unknown as [] } }),
        ).toEqual({ kind: "empty" });
    });
});
