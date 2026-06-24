import { describe, expect, it } from "vitest";
import {
    deriveStatsView,
    deriveConnectionView,
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
