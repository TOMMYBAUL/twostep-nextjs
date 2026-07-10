import { describe, it, expect } from "vitest";
import {
    computeSlaForPopulation,
    computeMerchantSlaSnapshots,
    type SlaProductRow,
    type MerchantSlaRow,
} from "@/lib/monitoring/merchant-sla";
import { isFeedEligible } from "@/lib/google/feed-eligibility";
import { computeStockConfidence } from "@/lib/stock/confidence";

/**
 * G1 (audit 07-04 Cluster G) — métrique SLA « % offres fraîches/publiables » par marchand.
 *
 * Propriété cruciale = PARITÉ (critère « fait » de l'audit : « test parité avec
 * computeStockConfidence ») : le SLA réutilise le VRAI gate feed (`isFeedEligible`) et LA
 * définition de confiance consommateur (`computeStockConfidence` sur `source_ts` honnête).
 * Ces tests vérifient que le SLA ne peut pas raconter autre chose que ce que le feed publie
 * et que ce que le consommateur voit — jamais une 2ᵉ logique qui dériverait.
 */

const NOW = new Date("2026-07-10T12:00:00Z");
const hoursAgo = (h: number): string => new Date(NOW.getTime() - h * 3_600_000).toISOString();

/** Produit publiable (EAN+prix+photo) avec un stock paramétrable. */
function row(p: Partial<SlaProductRow> & { stock?: SlaProductRow["stock"] }): SlaProductRow {
    return {
        ean: "0884776073143",
        price: 129.99,
        photo_url: "https://cdn/x.jpg",
        photo_processed_url: null,
        stock: { quantity: 5, source: "webhook", source_ts: hoursAgo(1), updated_at: hoursAgo(1) },
        ...p,
    };
}

describe("computeSlaForPopulation — publiable × en-stock × frais", () => {
    it("cas nominal : webhook frais + qty saine = frais (état 'available' consommateur)", () => {
        const s = computeSlaForPopulation([row({})], {}, NOW);
        expect(s).toMatchObject({
            total: 1,
            publishable: 1,
            in_stock: 1,
            publishable_in_stock: 1,
            fresh_available: 1,
            freshness_score: 100,
        });
    });

    it("PARITÉ confidence : frais ⟺ computeStockConfidence dit 'available' (batterie sale)", () => {
        // Chaque cas : la source/fraîcheur/quantité varie — le SLA doit compter EXACTEMENT
        // les produits que la confidence afficherait « Disponible ».
        const stocks: Array<{ quantity: number; source: string; source_ts: string | null; updated_at: string | null }> = [
            { quantity: 5, source: "webhook", source_ts: hoursAgo(1), updated_at: hoursAgo(1) }, // frais realtime
            { quantity: 5, source: "webhook", source_ts: hoursAgo(30), updated_at: hoursAgo(30) }, // realtime périmé (>24h)
            { quantity: 5, source: "file_push", source_ts: hoursAgo(8), updated_at: hoursAgo(8) }, // snapshot frais (<12h)
            { quantity: 5, source: "file_push", source_ts: hoursAgo(13), updated_at: hoursAgo(13) }, // snapshot périmé
            { quantity: 5, source: "pos_sync", source_ts: hoursAgo(2), updated_at: hoursAgo(2) }, // snapshot frais
            { quantity: 5, source: "manual", source_ts: hoursAgo(1), updated_at: hoursAgo(1) }, // manuel : jamais available
            { quantity: 2, source: "webhook", source_ts: hoursAgo(1), updated_at: hoursAgo(1) }, // qty basse → probable
            { quantity: 5, source: "webhook", source_ts: null, updated_at: null }, // aucun événement
        ];
        const rows = stocks.map((st) => row({ stock: st }));
        const expected = stocks.filter(
            (st) =>
                computeStockConfidence({
                    quantity: st.quantity,
                    lastEventAt: st.source_ts,
                    source: st.source === "webhook" ? "realtime" : st.source === "manual" ? "manual" : "snapshot",
                    now: NOW,
                }).state === "available",
        ).length;

        const s = computeSlaForPopulation(rows, {}, NOW);
        expect(s.fresh_available).toBe(expected);
        expect(expected).toBe(3); // sanity : realtime 1h + snapshot 8h + snapshot 2h
        expect(s.publishable_in_stock).toBe(8);
        expect(s.freshness_score).toBe(Math.round((3 / 8) * 100));
    });

    it("fraîcheur HONNÊTE : source_ts futur (artefact) plafonné par updated_at ancien → PAS frais", () => {
        // Ligne pré-104 back-fillée : source_ts=now (faux) mais updated_at=il y a 3 jours (vrai).
        const s = computeSlaForPopulation(
            [row({ stock: { quantity: 5, source: "webhook", source_ts: hoursAgo(0), updated_at: hoursAgo(72) } })],
            {},
            NOW,
        );
        expect(s.fresh_available).toBe(0); // 72h > fenêtre realtime 24h — jamais plus frais que la réalité
    });

    it("PARITÉ gate feed : un produit non publiable (sans image) est en stock mais PAS dans le SLA", () => {
        const noImage = row({ photo_url: null, photo_processed_url: null });
        expect(isFeedEligible(noImage)).toBe(false); // verrou : c'est bien le gate réel qui tranche
        const s = computeSlaForPopulation([noImage], {}, NOW);
        expect(s).toMatchObject({ total: 1, publishable: 0, in_stock: 1, publishable_in_stock: 0, fresh_available: 0, freshness_score: 0 });
    });

    it("PARITÉ flag D2 (allowMissingImage) : sous le tier GTIN-only le même produit COMPTE", () => {
        const noImage = row({ photo_url: null, photo_processed_url: null });
        const s = computeSlaForPopulation([noImage], { allowMissingImage: true }, NOW);
        expect(s).toMatchObject({ publishable: 1, publishable_in_stock: 1, fresh_available: 1, freshness_score: 100 });
    });

    it("qty 0 : ni en stock ni frais ; dénominateur 0 → score 0 (pas NaN, pas 100 trompeur)", () => {
        const s = computeSlaForPopulation([row({ stock: { quantity: 0, source: "webhook", source_ts: hoursAgo(1), updated_at: hoursAgo(1) } })], {}, NOW);
        expect(s).toMatchObject({ total: 1, publishable: 1, in_stock: 0, publishable_in_stock: 0, fresh_available: 0, freshness_score: 0 });
    });

    it("population vide → tout à 0 (jamais NaN)", () => {
        const s = computeSlaForPopulation([], {}, NOW);
        expect(s).toMatchObject({ total: 0, publishable: 0, in_stock: 0, publishable_in_stock: 0, fresh_available: 0, freshness_score: 0, score: 0 });
    });

    it("stock en TABLEAU (forme PostgREST) et stock null sont normalisés", () => {
        const asArray = row({ stock: [{ quantity: 5, source: "webhook", source_ts: hoursAgo(1), updated_at: hoursAgo(1) }] });
        const asNull = row({ stock: null });
        const s = computeSlaForPopulation([asArray, asNull], {}, NOW);
        expect(s).toMatchObject({ in_stock: 1, fresh_available: 1 });
    });

    it("source inconnue/absente → prudence 'manual' → jamais frais", () => {
        const s = computeSlaForPopulation(
            [row({ stock: { quantity: 5, source: null, source_ts: hoursAgo(1), updated_at: hoursAgo(1) } })],
            {},
            NOW,
        );
        expect(s.fresh_available).toBe(0);
    });
});

describe("computeMerchantSlaSnapshots — groupage marchand + population feed", () => {
    const m = (merchantId: string, extra: Partial<MerchantSlaRow>): MerchantSlaRow => ({
        ...row({}),
        merchant_id: merchantId,
        visible: true,
        review_status: "validated",
        variant_of: null,
        ...extra,
    });

    it("groupe par marchand, ordre déterministe, chiffres indépendants", () => {
        const rows = [
            m("MB", {}),
            m("MA", {}),
            m("MA", { stock: { quantity: 5, source: "manual", source_ts: hoursAgo(1), updated_at: hoursAgo(1) } }),
        ];
        const snaps = computeMerchantSlaSnapshots(rows, {}, NOW);
        expect(snaps.map((s) => s.merchant_id)).toEqual(["MA", "MB"]); // tri déterministe
        expect(snaps[0]).toMatchObject({ total: 2, publishable_in_stock: 2, fresh_available: 1, freshness_score: 50 });
        expect(snaps[1]).toMatchObject({ total: 1, fresh_available: 1, freshness_score: 100 });
    });

    it("PARITÉ population feed : pending / invisible / variante EXCLUS du dénominateur ET du numérateur", () => {
        const rows = [
            m("MA", {}),
            m("MA", { review_status: "pending" }), // pas encore validé = pas une offre feed
            m("MA", { visible: false }), // masqué = pas au feed
            m("MA", { variant_of: "parent-id" }), // variante = roule vers le principal
            m("MA", { review_status: null }), // legacy null ≠ 'validated' strict (parité SQL stats)
        ];
        const snaps = computeMerchantSlaSnapshots(rows, {}, NOW);
        expect(snaps).toHaveLength(1);
        expect(snaps[0]).toMatchObject({ total: 1, publishable: 1, fresh_available: 1 });
    });

    it("marchand sans produit dans la population feed → AUCUN snapshot (pas un faux 0 %)", () => {
        const snaps = computeMerchantSlaSnapshots([m("MA", { visible: false })], {}, NOW);
        expect(snaps).toEqual([]);
    });

    it("merchant_id absent/vide → ligne ignorée (jamais un groupe fantôme)", () => {
        const snaps = computeMerchantSlaSnapshots([m("", {})], {}, NOW);
        expect(snaps).toEqual([]);
    });
});
