import { describe, it, expect } from "vitest";
import { resolveProductSize } from "@/lib/pos/extract-size";

describe("resolveProductSize — préférer la variante structurée à la regex", () => {
    it("utilise la taille structurée du POS quand elle existe", () => {
        // Nom ambigu où la regex échouerait ou se tromperait, mais le POS donne "42".
        expect(resolveProductSize({ size: "42", name: "Sneaker modèle X" })).toBe("42");
    });

    it("ignore 'Default Title' (Shopify mono-variante) et retombe sur la regex", () => {
        expect(resolveProductSize({ size: "Default Title", name: "Nike Air Max taille 43" })).toBe("43");
    });

    it("retombe sur la regex du nom si pas de taille structurée", () => {
        expect(resolveProductSize({ size: null, name: "Botte cuir — taille 38" })).toBe("38");
        expect(resolveProductSize({ name: "Pull col rond taille M" })).toBe("M");
    });

    it("garde une taille structurée non numérique (XL)", () => {
        expect(resolveProductSize({ size: "XL", name: "T-shirt noir" })).toBe("XL");
    });

    it("null si ni structurée ni détectable", () => {
        expect(resolveProductSize({ size: null, name: "Bougie parfumée" })).toBeNull();
    });
});
