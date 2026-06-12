import { describe, it, expect } from "vitest";
import { computeStockConfidence, stockStateLabel } from "@/lib/stock/confidence";

const now = new Date("2026-06-12T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("computeStockConfidence", () => {
    it("quantité 0 → épuisé", () => {
        const r = computeStockConfidence({ quantity: 0, lastEventAt: minutesAgo(5), source: "realtime", now });
        expect(r.state).toBe("out");
    });

    it("caisse temps réel, frais, quantité saine → disponible + libellé", () => {
        const r = computeStockConfidence({ quantity: 8, lastEventAt: minutesAgo(12), source: "realtime", now });
        expect(r.state).toBe("available");
        expect(r.freshnessLabel).toBe("vu il y a 12 min");
    });

    it("quantité basse (≤2) → probable même si frais (zone d'erreur système)", () => {
        const r = computeStockConfidence({ quantity: 1, lastEventAt: minutesAgo(5), source: "realtime", now });
        expect(r.state).toBe("probable");
    });

    it("snapshot périmé (>12h) → probable", () => {
        const r = computeStockConfidence({ quantity: 10, lastEventAt: hoursAgo(20), source: "snapshot", now });
        expect(r.state).toBe("probable");
        expect(r.freshnessLabel).toBe("vu il y a 20 h");
    });

    it("snapshot frais (<12h) → disponible", () => {
        const r = computeStockConfidence({ quantity: 10, lastEventAt: hoursAgo(3), source: "snapshot", now });
        expect(r.state).toBe("available");
    });

    it("source manuelle → jamais disponible, plafonnée à probable", () => {
        const r = computeStockConfidence({ quantity: 50, lastEventAt: minutesAgo(1), source: "manual", now });
        expect(r.state).toBe("probable");
    });

    it("aucun événement de stock → probable, pas de libellé de fraîcheur", () => {
        const r = computeStockConfidence({ quantity: 5, lastEventAt: null, source: "realtime", now });
        expect(r.state).toBe("probable");
        expect(r.freshnessLabel).toBeNull();
    });

    it("libellés FR", () => {
        expect(stockStateLabel("available")).toBe("Disponible");
        expect(stockStateLabel("probable")).toBe("Stock probable");
        expect(stockStateLabel("out")).toBe("Épuisé");
    });
});
