import { describe, expect, it } from "vitest";
import {
    deriveFeedPreviewView,
    feedBlockReasonLabel,
    FEED_BLOCK_REASON_LABEL_FR,
    type FeedPreviewData,
    type FeedPreviewItem,
} from "@/lib/google/feed-preview-view";
import type { PublishabilitySummary } from "@/lib/google/feed-eligibility";

// Un résumé publiabilité minimal, cohérent avec `summarizePublishability`.
function summary(over: Partial<PublishabilitySummary> = {}): PublishabilitySummary {
    return {
        total: 0,
        publishable: 0,
        missing_ean: 0,
        missing_price: 0,
        missing_image: 0,
        blocked_only_by_image: 0,
        score: 0,
        ...over,
    };
}

const publishedItem: FeedPreviewItem = {
    offerId: "p1",
    gtin: "3401579611111",
    title: "Doudoune Deerskin",
    brand: "Deerskin",
    price: { value: "129.00", currency: "EUR" },
    imageLink: "https://cdn.example/p1.jpg",
    availability: "in stock",
};

function previewData(over: Partial<FeedPreviewData> = {}): FeedPreviewData {
    return {
        merchant_id: "m1",
        store_code: "twostep-abcd1234",
        google_connected: true,
        gtin_only_tier: false,
        summary: summary({ total: 3, publishable: 2, score: 67 }),
        would_publish: [publishedItem],
        blocked: [
            { id: "p2", name: "Écharpe sans code", ean: null, price: 19.9, reasons: ["missing_ean"] },
        ],
        ...over,
    };
}

describe("deriveFeedPreviewView — honnêteté du chargement (north-star : jamais un faux « rien à publier »)", () => {
    it("HTTP !ok → error (un 500 {error} ne doit PAS passer pour un preview vide)", () => {
        expect(deriveFeedPreviewView({ ok: false, data: null })).toEqual({ kind: "error" });
    });

    it("ok mais data null (corps inattendu) → error, jamais empty", () => {
        expect(deriveFeedPreviewView({ ok: true, data: null })).toEqual({ kind: "error" });
    });

    it("ok mais ok=false avec data présente (incohérence) → error (on ne fait pas confiance à un ok faux)", () => {
        // Défense : si l'appelant marque ok=false, on refuse la donnée quoi qu'il arrive.
        expect(deriveFeedPreviewView({ ok: false, data: previewData() })).toEqual({ kind: "error" });
    });

    it("catalogue vide (total=0 ET aucune liste) → empty (guidage import), pas error", () => {
        const view = deriveFeedPreviewView({
            ok: true,
            data: previewData({ summary: summary({ total: 0 }), would_publish: [], blocked: [] }),
        });
        expect(view).toEqual({ kind: "empty" });
    });
});

describe("deriveFeedPreviewView — la garde empty exige les TROIS conditions (jamais masquer un feed réel)", () => {
    it("total=0 mais would_publish non vide (drift) → preview, PAS empty", () => {
        const view = deriveFeedPreviewView({
            ok: true,
            data: previewData({ summary: summary({ total: 0 }), would_publish: [publishedItem], blocked: [] }),
        });
        expect(view.kind).toBe("preview");
    });

    it("total=0 mais blocked non vide (drift) → preview, PAS empty (le marchand doit voir les bloqués)", () => {
        const view = deriveFeedPreviewView({
            ok: true,
            data: previewData({ summary: summary({ total: 0 }), would_publish: [], blocked: previewData().blocked }),
        });
        expect(view.kind).toBe("preview");
    });
});

describe("deriveFeedPreviewView — mapping preview (présente, ne recalcule rien)", () => {
    it("mappe tous les champs de la réponse tels quels", () => {
        const data = previewData({ gtin_only_tier: true, google_connected: false });
        const view = deriveFeedPreviewView({ ok: true, data });
        expect(view).toEqual({
            kind: "preview",
            storeCode: "twostep-abcd1234",
            googleConnected: false,
            gtinOnlyTier: true,
            summary: data.summary,
            wouldPublish: data.would_publish,
            blocked: data.blocked,
        });
    });

    it("trust le verdict serveur : summary/would_publish/blocked passés par référence (pas de recalcul)", () => {
        const data = previewData();
        const view = deriveFeedPreviewView({ ok: true, data });
        // Anti-divergence : le deriver ne doit pas ré-évaluer l'éligibilité — il présente.
        expect(view.kind === "preview" && view.summary).toBe(data.summary);
        expect(view.kind === "preview" && view.wouldPublish).toBe(data.would_publish);
    });
});

describe("feedBlockReasonLabel — FR + fallback (jamais d'écran vide)", () => {
    it("chaque cause connue a un libellé FR non vide", () => {
        for (const reason of ["missing_ean", "missing_price", "missing_image"] as const) {
            expect(FEED_BLOCK_REASON_LABEL_FR[reason]).toBeTruthy();
            expect(feedBlockReasonLabel(reason)).toBe(FEED_BLOCK_REASON_LABEL_FR[reason]);
        }
    });

    it("un code inconnu retombe sur lui-même (fallback, pas de undefined affiché)", () => {
        // @ts-expect-error — on teste délibérément un code hors union (robustesse d'affichage).
        expect(feedBlockReasonLabel("some_new_reason")).toBe("some_new_reason");
    });
});
