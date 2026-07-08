/**
 * P0-4 (2026-07-08) — Vue PURE du badge de stock conso.
 *
 * Bug fermé : les surfaces conso (discover/recherche/favoris/boutique) affichaient
 * « Stock vérifié » sur le SEUL `quantity > 0` (compteur brut) pendant que la page
 * produit (M5) disait « Stock probable » et le feed Google « out of stock » =
 * 3 vérités contradictoires. Règle du deriver : un verdict M5 serveur s'AFFICHE
 * (jamais recalculé côté client) ; SANS verdict, l'état est PRUDENT et ne peut
 * JAMAIS être « available » (« Disponible » sans preuve = le mensonge fermé).
 */
import { describe, it, expect } from "vitest";
import { deriveStockBadgeView } from "@/lib/stock/stock-badge-view";

describe("deriveStockBadgeView — verdict serveur = passthrough", () => {
    it("available → affiché tel quel, label serveur prioritaire, fraîcheur transmise", () => {
        const v = deriveStockBadgeView({
            confidence: { state: "available", label: "Disponible", freshnessLabel: "vu il y a 12 min" },
            quantity: 5,
        });
        expect(v).toEqual({ state: "available", label: "Disponible", freshnessLabel: "vu il y a 12 min" });
    });

    it("le verdict serveur GAGNE même si la quantité locale semble le contredire (jamais recalculé client)", () => {
        // Le serveur a lu source/fraîcheur/signalements — la quantité de la ligne RPC peut être plus vieille.
        const v = deriveStockBadgeView({
            confidence: { state: "out", label: "Épuisé", freshnessLabel: null },
            quantity: 7,
        });
        expect(v.state).toBe("out");
        const v2 = deriveStockBadgeView({
            confidence: { state: "available", label: "Disponible", freshnessLabel: "vu à l'instant" },
            quantity: 0,
        });
        expect(v2.state).toBe("available");
    });

    it("label serveur absent → libellé FR canonique par état (stockStateLabel)", () => {
        expect(deriveStockBadgeView({ confidence: { state: "probable" }, quantity: 2 }).label).toBe("Stock probable");
        expect(deriveStockBadgeView({ confidence: { state: "available" }, quantity: 2 }).label).toBe("Disponible");
    });

    it("état out → freshnessLabel toujours null (pas de fraîcheur pertinente sur un épuisé)", () => {
        const v = deriveStockBadgeView({
            confidence: { state: "out", freshnessLabel: "vu il y a 2 h" },
            quantity: 0,
        });
        expect(v.freshnessLabel).toBeNull();
    });
});

describe("deriveStockBadgeView — SANS verdict : prudent, jamais « Disponible »", () => {
    it("RÉGRESSION P0-4 : quantité > 0 sans verdict → « Stock probable », JAMAIS available", () => {
        for (const qty of [1, 3, 42, 999]) {
            const v = deriveStockBadgeView({ confidence: null, quantity: qty });
            expect(v.state).toBe("probable");
            expect(v.label).toBe("Stock probable");
            expect(v.state).not.toBe("available");
        }
    });

    it("quantité 0 / négative → Épuisé", () => {
        expect(deriveStockBadgeView({ confidence: null, quantity: 0 }).state).toBe("out");
        expect(deriveStockBadgeView({ confidence: null, quantity: -2 }).state).toBe("out");
    });

    it("quantité inconnue (null/undefined/NaN) → Épuisé (jamais un compteur fabriqué, ex-`?? 99`)", () => {
        expect(deriveStockBadgeView({ confidence: null, quantity: null }).state).toBe("out");
        expect(deriveStockBadgeView({ confidence: null, quantity: undefined }).state).toBe("out");
        expect(deriveStockBadgeView({ confidence: null, quantity: Number.NaN }).state).toBe("out");
    });

    it("état serveur inattendu (payload corrompu) → repli prudent, pas de crash", () => {
        const v = deriveStockBadgeView({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            confidence: { state: "verified" as any },
            quantity: 5,
        });
        expect(v.state).toBe("probable");
    });
});
