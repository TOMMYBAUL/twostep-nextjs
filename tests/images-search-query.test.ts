/**
 * MAILLON 9 (b) — Stratégie de requête d'image Serper (partie PURE, unit-testable).
 *
 * North-star « exactitude = la promesse / zéro faux positif visuel ». Le test réel
 * du 2026-06-27 a montré 6/7 photos FAUSSES (colle→pantalon, BBQ→casque). Cause
 * directe : `searchProductImage` lançait une requête Google Images sur le NUMÉRO EAN
 * BRUT (`${ean} ${productName}`) — Google Images matche un nombre à 13 chiffres
 * contre le texte des pages → bruit (comparateurs/marketplaces) → mauvaise photo.
 *
 * Fix (b) : la construction des requêtes est extraite en fonction PURE
 * `buildImageSearchQueries` (testable sans clé Serper) et le numéro EAN n'est PLUS
 * jamais un terme de requête image. Chaque assertion ci-dessous échouerait sur
 * l'ancien code (qui injectait l'EAN brut dans une query).
 *
 * NB : la correctude VISUELLE finale (l'image renvoyée matche-t-elle ?) exige une
 * clé Serper + ANTHROPIC live → escaladée (run supervisé). Ici on prouve la STRATÉGIE.
 */
import { describe, expect, it } from "vitest";
import { buildImageSearchQueries } from "@/lib/images/serper";

const EAN = "3017620422003"; // vrai EAN Nutella — sert d'appât "bruit"

describe("buildImageSearchQueries — l'EAN brut n'est jamais un terme de requête image", () => {
    it("aucune requête ne contient le numéro EAN (même si on a un EAN en amont)", () => {
        // L'EAN n'est PAS un paramètre de buildImageSearchQueries — c'est volontaire :
        // la fonction ne peut structurellement pas l'injecter. On prouve qu'avec des
        // entrées réalistes, aucune query ne ressemble au barcode.
        const queries = buildImageSearchQueries("Pâte à tartiner", "Nutella", "REF-1234", "Marron");
        for (const q of queries) {
            expect(q).not.toContain(EAN);
            // Pas de longue suite de chiffres (≥8) = pas de barcode déguisé.
            expect(q).not.toMatch(/\d{8,}/);
        }
    });

    it("génère les 3 stratégies dans l'ordre (SKU → brand+name product → fiche produit FR)", () => {
        const queries = buildImageSearchQueries("Air Force 1", "Nike", "DD1391-100", null);
        expect(queries).toEqual([
            "DD1391-100 Nike",
            "Nike Air Force 1 product",
            "Nike Air Force 1 fiche produit",
        ]);
    });

    it("le SKU précis (≥4 chars) passe EN PREMIER (signal le plus fort)", () => {
        const queries = buildImageSearchQueries("Casque audio", "Bose", "QC45BLK", null);
        expect(queries[0]).toBe("QC45BLK Bose");
    });

    it("ignore un SKU trop court (<4 chars) — risque de matcher un code parasite", () => {
        const queries = buildImageSearchQueries("Casque audio", "Bose", "QC", null);
        // Pas de query SKU en tête ; on tombe direct sur brand+name.
        expect(queries[0]).toBe("Bose Casque audio product");
        expect(queries.some((q) => q.startsWith("QC "))).toBe(false);
    });

    it("sans SKU : seulement brand+name (product) puis fiche produit FR", () => {
        const queries = buildImageSearchQueries("T-shirt col rond", "Armor Lux", null, null);
        expect(queries).toEqual([
            "Armor Lux T-shirt col rond product",
            "Armor Lux T-shirt col rond fiche produit",
        ]);
    });

    it("sans marque : la requête reste sur le nom seul (jamais une query vide / 'product' orphelin)", () => {
        const queries = buildImageSearchQueries("Lampe de bureau LED", null, null, null);
        expect(queries).toEqual([
            "Lampe de bureau LED product",
            "Lampe de bureau LED fiche produit",
        ]);
        // Aucune query ne doit être réduite à "product" / "fiche produit" seuls.
        expect(queries.some((q) => q === "product" || q === "fiche produit")).toBe(false);
    });

    it("le coloris est normalisé (/ et , → espace) et collé à chaque query", () => {
        const queries = buildImageSearchQueries("Air Max 90", "Nike", "DD1391-100", "Noir/Blanc");
        expect(queries[0]).toBe("DD1391-100 Nike Noir Blanc");
        expect(queries[1]).toBe("Nike Air Max 90 Noir Blanc product");
        expect(queries[2]).toBe("Nike Air Max 90 Noir Blanc fiche produit");
        // Pas de slash résiduel ni d'espaces multiples.
        for (const q of queries) {
            expect(q).not.toContain("/");
            expect(q).not.toMatch(/\s{2,}/);
        }
    });

    it("sans SKU + sans nom (cas dégénéré) ne produit que des queries non vides", () => {
        // name vide → "brand product" reste exploitable, jamais une chaîne vide.
        const queries = buildImageSearchQueries("", "Lego", null, null);
        expect(queries).toEqual(["Lego product", "Lego fiche produit"]);
        expect(queries.every((q) => q.length > 0)).toBe(true);
    });

    it("cas dégénéré (ni nom ni marque) → 0 requête (pas de 'product' orphelin qui gaspille un crédit)", () => {
        // Sans nom ET sans marque, la query se réduirait à "product"/"fiche produit"
        // seuls = recherche d'image vide de sens. On préfère 0 requête → le caller
        // renvoie null (pas d'image au hasard, north-star « zéro faux positif »).
        expect(buildImageSearchQueries("", null, null, null)).toEqual([]);
        expect(buildImageSearchQueries("   ", "  ", null, null)).toEqual([]);
        // Mais un coloris seul ne suffit pas à sauver une query (pas de produit identifiable).
        expect(buildImageSearchQueries("", null, null, "Noir")).toEqual([]);
        // En revanche un SKU est auto-suffisant (référence discriminante) même sans nom/marque.
        expect(buildImageSearchQueries("", null, "DD1391-100", null)).toEqual(["DD1391-100"]);
    });

    it("déduplique les requêtes identiques en préservant l'ordre", () => {
        // SKU == identique au début pourrait dupliquer ; ici on vérifie l'unicité générale.
        const queries = buildImageSearchQueries("Produit", "Marque", "ABCD", null);
        expect(new Set(queries).size).toBe(queries.length);
    });
});
