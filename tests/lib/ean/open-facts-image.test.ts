import { describe, expect, it } from "vitest";
import { extractOpenFactsImage } from "@/lib/ean/open-facts-image";

// MAILLON 9 — GTIN-keyée image extraction from an Open Facts v2 `product` object.
// "Preuve sans yeux" : on prouve la sélection de l'URL champ par champ sur des objets `product`
// réalistes (forme exacte de l'API OBF/OPF v2), pas le rendu visuel (qui reste à Thomas, e2e live).
describe("extractOpenFactsImage", () => {
    it("picks image_front_url first (front-of-pack, full size)", () => {
        const product = {
            product_name: "Coca-Cola 33cl",
            image_front_url: "https://images.openfoodfacts.org/images/products/000/000/front_fr.4.400.jpg",
            image_url: "https://images.openfoodfacts.org/images/products/000/000/1.jpg",
        };
        expect(extractOpenFactsImage(product)).toBe(
            "https://images.openfoodfacts.org/images/products/000/000/front_fr.4.400.jpg",
        );
    });

    it("falls back to image_url when image_front_url is absent", () => {
        const product = {
            image_url: "https://images.openbeautyfacts.org/images/products/123/main.jpg",
        };
        expect(extractOpenFactsImage(product)).toBe(
            "https://images.openbeautyfacts.org/images/products/123/main.jpg",
        );
    });

    it("falls back to selected_images.front.display (FR preferred, then EN)", () => {
        const product = {
            selected_images: {
                front: {
                    display: {
                        en: "https://images.openproductsfacts.org/p/front_en.jpg",
                        fr: "https://images.openproductsfacts.org/p/front_fr.jpg",
                    },
                },
            },
        };
        expect(extractOpenFactsImage(product)).toBe(
            "https://images.openproductsfacts.org/p/front_fr.jpg",
        );
    });

    it("uses selected_images.front.display.en when no FR is present", () => {
        const product = {
            selected_images: {
                front: { display: { en: "https://images.openproductsfacts.org/p/front_en.jpg" } },
            },
        };
        expect(extractOpenFactsImage(product)).toBe(
            "https://images.openproductsfacts.org/p/front_en.jpg",
        );
    });

    it("uses any available language in selected_images when neither FR nor EN", () => {
        const product = {
            selected_images: {
                front: { display: { de: "https://images.openproductsfacts.org/p/front_de.jpg" } },
            },
        };
        expect(extractOpenFactsImage(product)).toBe(
            "https://images.openproductsfacts.org/p/front_de.jpg",
        );
    });

    // ── Anti faux-positif d'image (north-star) : ne JAMAIS émettre une image vide/invalide ──
    it("returns null for a product with no image fields", () => {
        expect(extractOpenFactsImage({ product_name: "No image product", brands: "Acme" })).toBeNull();
    });

    it("rejects an empty / whitespace image URL (Google rejette un image_link vide)", () => {
        expect(extractOpenFactsImage({ image_front_url: "" })).toBeNull();
        expect(extractOpenFactsImage({ image_front_url: "   " })).toBeNull();
        expect(extractOpenFactsImage({ image_url: "" })).toBeNull();
    });

    it("rejects a non-http(s) / relative URL", () => {
        expect(extractOpenFactsImage({ image_front_url: "/images/products/123/front.jpg" })).toBeNull();
        expect(extractOpenFactsImage({ image_url: "ftp://example.org/img.jpg" })).toBeNull();
        expect(extractOpenFactsImage({ image_url: "data:image/png;base64,AAAA" })).toBeNull();
    });

    it("skips an empty primary and recovers a valid fallback", () => {
        const product = {
            image_front_url: "",
            image_url: "   ",
            selected_images: { front: { display: { fr: "https://img.openfoodfacts.org/ok.jpg" } } },
        };
        expect(extractOpenFactsImage(product)).toBe("https://img.openfoodfacts.org/ok.jpg");
    });

    it("trims surrounding whitespace from a valid URL", () => {
        expect(extractOpenFactsImage({ image_front_url: "  https://img.openfoodfacts.org/x.jpg  " })).toBe(
            "https://img.openfoodfacts.org/x.jpg",
        );
    });

    it("accepts http (not only https)", () => {
        expect(extractOpenFactsImage({ image_url: "http://img.openfoodfacts.org/x.jpg" })).toBe(
            "http://img.openfoodfacts.org/x.jpg",
        );
    });

    // ── Robustesse : ne jamais throw sur une forme inattendue (non-objet, champs mal typés) ──
    it("returns null for non-object / nullish / malformed input", () => {
        expect(extractOpenFactsImage(null)).toBeNull();
        expect(extractOpenFactsImage(undefined)).toBeNull();
        expect(extractOpenFactsImage("a string")).toBeNull();
        expect(extractOpenFactsImage(42)).toBeNull();
        expect(extractOpenFactsImage({ image_front_url: 12345 })).toBeNull();
        expect(extractOpenFactsImage({ selected_images: "nope" })).toBeNull();
        expect(extractOpenFactsImage({ selected_images: { front: null } })).toBeNull();
        expect(extractOpenFactsImage({ selected_images: { front: { display: "nope" } } })).toBeNull();
    });
});
