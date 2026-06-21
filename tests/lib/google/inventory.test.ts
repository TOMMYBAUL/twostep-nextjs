import { describe, expect, it } from "vitest";
import {
    resolveStockQuantity,
    buildLocalInventoryPayload,
} from "@/lib/google/inventory";

describe("resolveStockQuantity", () => {
    // PostgREST renvoie l'embed `stock(quantity)` sous plusieurs formes selon la
    // cardinalité détectée. Chaque forme doit donner la VRAIE quantité — une lecture
    // ratée = quantité fausse poussée à Google = faux positif (l'ennemi n°1).

    it("reads an embedded to-many array (PostgREST par défaut)", () => {
        expect(resolveStockQuantity([{ quantity: 7 }])).toBe(7);
    });

    it("reads an embedded to-one object", () => {
        expect(resolveStockQuantity({ quantity: 12 })).toBe(12);
    });

    it("takes the first row of a to-many array", () => {
        expect(resolveStockQuantity([{ quantity: 3 }, { quantity: 99 }])).toBe(3);
    });

    it("coerces a numeric string quantity", () => {
        // Supabase peut sérialiser une colonne numeric/bigint en string.
        expect(resolveStockQuantity([{ quantity: "5" }])).toBe(5);
        expect(resolveStockQuantity({ quantity: "8" })).toBe(8);
    });

    // --- Défaut CONSERVATEUR : toute forme absente/illisible → 0 ("out of stock"),
    //     JAMAIS un faux "en stock". C'est l'invariant nord du north-star.

    it("returns 0 for null / undefined stock (aucune ligne)", () => {
        expect(resolveStockQuantity(null)).toBe(0);
        expect(resolveStockQuantity(undefined)).toBe(0);
    });

    it("returns 0 for an empty array (produit sans stock)", () => {
        expect(resolveStockQuantity([])).toBe(0);
    });

    it("returns 0 for a missing/empty quantity field", () => {
        expect(resolveStockQuantity([{}])).toBe(0);
        expect(resolveStockQuantity({})).toBe(0);
        expect(resolveStockQuantity([{ quantity: null }])).toBe(0);
    });

    it("returns 0 for a non-finite or unparseable quantity (jamais NaN poussé)", () => {
        expect(resolveStockQuantity([{ quantity: "abc" }])).toBe(0);
        expect(resolveStockQuantity([{ quantity: Number.NaN }])).toBe(0);
        expect(resolveStockQuantity([{ quantity: Infinity }])).toBe(0);
    });

    it("clamps a negative quantity to 0 (out of stock, jamais < 0)", () => {
        expect(resolveStockQuantity([{ quantity: -4 }])).toBe(0);
    });
});

describe("buildLocalInventoryPayload", () => {
    it("maps quantity > 0 to 'in stock' (avec ESPACE, jamais l'underscore)", () => {
        const payload = buildLocalInventoryPayload("store-1", "prod-42", 3);
        expect(payload.availability).toBe("in stock");
        // Verrou explicite anti-régression : l'underscore = rejet silencieux Google.
        expect(payload.availability).not.toContain("_");
    });

    it("maps quantity 0 to 'out of stock' (avec ESPACE)", () => {
        const payload = buildLocalInventoryPayload("store-1", "prod-42", 0);
        expect(payload.availability).toBe("out of stock");
        expect(payload.availability).not.toContain("_");
    });

    it("serialises quantity to a string (attendu par l'API Merchant)", () => {
        expect(buildLocalInventoryPayload("s", "p", 7).quantity).toBe("7");
        expect(buildLocalInventoryPayload("s", "p", 0).quantity).toBe("0");
    });

    it("passes storeCode and productId through verbatim (clé de jointure Google)", () => {
        const payload = buildLocalInventoryPayload("twostep-abc12345", "prod-99", 1);
        expect(payload.storeCode).toBe("twostep-abc12345");
        expect(payload.productId).toBe("prod-99");
    });
});
