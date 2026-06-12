import { describe, it, expect } from "vitest";
import { productConfidence, resolveSourceStrength } from "@/lib/stock/product-confidence";
import { REPORTS_WINDOW_H, reportsWindowStartIso } from "@/lib/stock/reports";

const now = new Date("2026-06-12T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe("resolveSourceStrength", () => {
    it("produit lié à une caisse (pos_item_id) → realtime", () => {
        expect(resolveSourceStrength({ posItemId: "shopify:123", merchantHasIngest: false })).toBe("realtime");
    });

    it("pos_item_id prime sur le jeton d'ingestion", () => {
        expect(resolveSourceStrength({ posItemId: "sq:9", merchantHasIngest: true })).toBe("realtime");
    });

    it("marchand avec jeton d'ingestion (push fichier) → snapshot", () => {
        expect(resolveSourceStrength({ posItemId: null, merchantHasIngest: true })).toBe("snapshot");
    });

    it("ni caisse ni ingestion → manual", () => {
        expect(resolveSourceStrength({ posItemId: null, merchantHasIngest: false })).toBe("manual");
    });
});

describe("productConfidence", () => {
    const base = {
        quantity: 10,
        lastEventAt: minutesAgo(12),
        posItemId: "shopify:123",
        merchantHasIngest: false,
        now,
    };

    it("caisse fraîche, quantité saine, 0 signalement → Disponible", () => {
        const r = productConfidence({ ...base, recentNotInStoreReports: 0 });
        expect(r.state).toBe("available");
        expect(r.label).toBe("Disponible");
        expect(r.freshnessLabel).toBe("vu il y a 12 min");
    });

    it("1 signalement récent → dégradé en probable", () => {
        const r = productConfidence({ ...base, recentNotInStoreReports: 1 });
        expect(r.state).toBe("probable");
        expect(r.label).toBe("Stock probable");
        expect(r.reason).toContain("downgraded by 1");
    });

    it("3 signalements récents → Épuisé, sans libellé de fraîcheur", () => {
        const r = productConfidence({ ...base, recentNotInStoreReports: 3 });
        expect(r.state).toBe("out");
        expect(r.label).toBe("Épuisé");
        expect(r.freshnessLabel).toBeNull();
    });

    it("source manuelle plafonnée à probable même sans signalement", () => {
        const r = productConfidence({ ...base, posItemId: null, recentNotInStoreReports: 0 });
        expect(r.state).toBe("probable");
    });

    it("snapshot (jeton d'ingestion) frais → Disponible", () => {
        const r = productConfidence({ ...base, posItemId: null, merchantHasIngest: true, recentNotInStoreReports: 0 });
        expect(r.state).toBe("available");
    });

    it("quantité 0 reste Épuisé quoi qu'il arrive", () => {
        const r = productConfidence({ ...base, quantity: 0, recentNotInStoreReports: 0 });
        expect(r.state).toBe("out");
    });
});

describe("reportsWindowStartIso", () => {
    it("borne basse = now - 48 h", () => {
        const iso = reportsWindowStartIso(now);
        expect(iso).toBe(new Date(now.getTime() - REPORTS_WINDOW_H * 3_600_000).toISOString());
        expect(iso).toBe("2026-06-10T12:00:00.000Z");
    });
});
