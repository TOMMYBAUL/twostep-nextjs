import { describe, expect, it } from "vitest";

import { feedAvailability } from "@/lib/google/feed-availability";
import { transformProductToGoogle } from "@/lib/google/feed";
import { buildLfpXml } from "@/lib/google/lfp-xml";

/**
 * Disponibilité Google HONNÊTE (M5) — le fix pilote-critique du faux « in stock ».
 *
 * Règle prouvée ici : « in stock » SEULEMENT si la confiance M5 est `available`
 * (source fiable webhook/pos_sync/file_push + source_ts dans la fenêtre M5 + qty > 2).
 * Tout le reste (manuel, périmé, qty basse, illisible) → « out of stock » — mais
 * l'offre RESTE dans le feed (elle rebascule dès qu'une donnée fraîche arrive).
 *
 * Seuils M5 réutilisés (PAS réinventés — cf. src/lib/stock/confidence.ts) :
 * realtime (webhook) 24 h, snapshot (pos_sync/file_push) 12 h, low-qty ≤ 2.
 */

const NOW = Date.parse("2026-07-01T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

/** Ligne stock « saine » : webhook frais, quantité saine. */
const freshWebhook = { quantity: 5, source: "webhook", source_ts: hoursAgo(1), updated_at: hoursAgo(1) };

describe("feedAvailability (helper pur, source unique des sorties Google)", () => {
    // ─── Stock FRAIS + source FIABLE → in stock ───
    it("webhook frais (1 h) + qty saine → in stock", () => {
        expect(feedAvailability([freshWebhook], NOW)).toBe("in stock");
    });

    it("webhook à 23 h (dans la fenêtre realtime 24 h) → in stock", () => {
        expect(feedAvailability([{ ...freshWebhook, source_ts: hoursAgo(23), updated_at: hoursAgo(23) }], NOW)).toBe("in stock");
    });

    it("pos_sync à 11 h (dans la fenêtre snapshot 12 h) → in stock", () => {
        expect(
            feedAvailability([{ quantity: 8, source: "pos_sync", source_ts: hoursAgo(11), updated_at: hoursAgo(11) }], NOW),
        ).toBe("in stock");
    });

    it("file_push frais → in stock", () => {
        expect(
            feedAvailability([{ quantity: 8, source: "file_push", source_ts: hoursAgo(1), updated_at: hoursAgo(1) }], NOW),
        ).toBe("in stock");
    });

    it("accepte la forme OBJET (embed to-one PostgREST)", () => {
        expect(feedAvailability(freshWebhook, NOW)).toBe("in stock");
    });

    // ─── Stock PÉRIMÉ → out of stock (le faux positif exact qu'on ferme) ───
    it("webhook PÉRIMÉ (25 h > fenêtre 24 h) → out of stock malgré qty > 0", () => {
        expect(feedAvailability([{ ...freshWebhook, source_ts: hoursAgo(25), updated_at: hoursAgo(25) }], NOW)).toBe("out of stock");
    });

    it("pos_sync PÉRIMÉ (13 h > fenêtre 12 h) → out of stock", () => {
        expect(
            feedAvailability([{ quantity: 8, source: "pos_sync", source_ts: hoursAgo(13), updated_at: hoursAgo(13) }], NOW),
        ).toBe("out of stock");
    });

    it("source_ts frais mais updated_at ancien (artefact horloge) → plafonné = out of stock", () => {
        // freshnessTs (M5) prend le plus ANCIEN des deux : ne jamais paraître plus frais que la réalité.
        expect(
            feedAvailability([{ quantity: 8, source: "webhook", source_ts: hoursAgo(1), updated_at: hoursAgo(48) }], NOW),
        ).toBe("out of stock");
    });

    // ─── Source FAIBLE (manuelle) → out of stock même fraîche ───
    it.each(["manual", "scan", "invoice", "cloture"])(
        "source %s (déclaration ponctuelle) → out of stock même fraîche et qty saine",
        (source) => {
            expect(feedAvailability([{ quantity: 10, source, source_ts: hoursAgo(0), updated_at: hoursAgo(0) }], NOW)).toBe(
                "out of stock",
            );
        },
    );

    it("source inconnue/absente (SELECT sans colonnes M5) → out of stock (défaut conservateur)", () => {
        expect(feedAvailability([{ quantity: 5 }], NOW)).toBe("out of stock");
        expect(feedAvailability([{ quantity: 5, source: "???" }], NOW)).toBe("out of stock");
    });

    // ─── Quantité : rupture et zone basse (M5 low-qty) ───
    it("qty 0 → out of stock (rupture, même fraîche)", () => {
        expect(feedAvailability([{ ...freshWebhook, quantity: 0 }], NOW)).toBe("out of stock");
    });

    it("qty ≤ 2 fraîche+fiable → out of stock (zone M5 où le système ment le plus)", () => {
        expect(feedAvailability([{ ...freshWebhook, quantity: 2 }], NOW)).toBe("out of stock");
        expect(feedAvailability([{ ...freshWebhook, quantity: 1 }], NOW)).toBe("out of stock");
    });

    it("aucune ligne stock (null / []) → out of stock, jamais un faux « en stock »", () => {
        expect(feedAvailability(null, NOW)).toBe("out of stock");
        expect(feedAvailability(undefined, NOW)).toBe("out of stock");
        expect(feedAvailability([], NOW)).toBe("out of stock");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// PARITÉ Voie A (transformProductToGoogle) / Voie B (buildLfpXml) / helper.
// Le preview réutilise transformProductToGoogle (même module) → parité par construction,
// prouvée en plus sur le chemin réel de la route dans feed-preview.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
describe("PARITÉ availability — Voie A / Voie B / feedAvailability", () => {
    const battery: Array<{ label: string; stock: unknown }> = [
        { label: "webhook frais qty saine", stock: [freshWebhook] },
        { label: "webhook périmé", stock: [{ ...freshWebhook, source_ts: hoursAgo(30), updated_at: hoursAgo(30) }] },
        { label: "pos_sync frais", stock: [{ quantity: 6, source: "pos_sync", source_ts: hoursAgo(2), updated_at: hoursAgo(2) }] },
        { label: "manuel frais", stock: [{ quantity: 6, source: "manual", source_ts: hoursAgo(0), updated_at: hoursAgo(0) }] },
        { label: "qty 0", stock: [{ ...freshWebhook, quantity: 0 }] },
        { label: "qty basse (2)", stock: [{ ...freshWebhook, quantity: 2 }] },
        { label: "sans colonnes M5 (legacy)", stock: [{ quantity: 9 }] },
        { label: "aucune ligne stock", stock: null },
    ];

    const product = (stock: unknown) => ({
        id: "22222222-2222-2222-2222-222222222222",
        name: "Nike Air Max 90",
        canonical_name: null,
        description: null,
        brand: null,
        ean: "0884776073143",
        price: 129.99,
        photo_url: "https://nike.com/airmax90.jpg",
        photo_processed_url: null,
        visible: true,
        stock,
    });

    it.each(battery)("$label : les 3 chemins émettent la MÊME availability", ({ stock }) => {
        const expected = feedAvailability(stock as never, NOW);

        // Voie A (Content API)
        const g = transformProductToGoogle(product(stock) as never, "store-1", NOW);
        expect(g.availability).toBe(expected);

        // Voie B (XML LFP)
        const xml = buildLfpXml({ id: "m1", name: "Boutique" }, [product(stock) as never], "store-1", NOW);
        const match = xml.match(/<g:availability>([^<]+)<\/g:availability>/);
        expect(match?.[1]).toBe(expected);
    });

    it("un produit périmé RESTE dans le feed (out of stock, jamais exclu)", () => {
        const stale = product([{ ...freshWebhook, source_ts: hoursAgo(30), updated_at: hoursAgo(30) }]);
        const xml = buildLfpXml({ id: "m1", name: "Boutique" }, [stale as never], "store-1", NOW);
        expect((xml.match(/<item>/g) ?? []).length).toBe(1);
        expect(xml).toContain("<g:availability>out of stock</g:availability>");
        expect(transformProductToGoogle(stale as never, "store-1", NOW).offerId).toBe(stale.id);
    });
});
