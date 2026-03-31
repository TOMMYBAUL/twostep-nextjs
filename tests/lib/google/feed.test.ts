import { describe, expect, it } from "vitest";
import { transformProductToGoogle, filterEligibleProducts } from "@/lib/google/feed";

describe("Google feed generation", () => {
    const baseProduct = {
        id: "prod-123",
        name: "NB 574 gris 42",
        canonical_name: "New Balance 574 Core Grey",
        ean: "0194956623215",
        price: 129.99,
        photo_processed_url: "https://r2.dev/products/abc/prod-123.webp",
        photo_url: "https://square.com/img/574.jpg",
        visible: true,
        stock: [{ quantity: 3 }],
    };

    it("transforms product to Google format", () => {
        const result = transformProductToGoogle(baseProduct, "store-001");
        expect(result.offerId).toBe("prod-123");
        expect(result.gtin).toBe("0194956623215");
        expect(result.title).toBe("New Balance 574 Core Grey");
        expect(result.price.value).toBe("129.99");
        expect(result.price.currency).toBe("EUR");
        expect(result.imageLink).toBe("https://r2.dev/products/abc/prod-123.webp");
        expect(result.availability).toBe("in_stock");
        expect(result.channel).toBe("local");
        expect(result.contentLanguage).toBe("fr");
        expect(result.targetCountry).toBe("FR");
        expect(result.condition).toBe("new");
        expect(result.storeCode).toBe("store-001");
    });

    it("uses name when canonical_name is null", () => {
        const product = { ...baseProduct, canonical_name: null };
        const result = transformProductToGoogle(product, "store-001");
        expect(result.title).toBe("NB 574 gris 42");
    });

    it("falls back to photo_url when photo_processed_url is null", () => {
        const product = { ...baseProduct, photo_processed_url: null };
        const result = transformProductToGoogle(product, "store-001");
        expect(result.imageLink).toBe("https://square.com/img/574.jpg");
    });

    it("marks out_of_stock when quantity is 0", () => {
        const product = { ...baseProduct, stock: [{ quantity: 0 }] };
        const result = transformProductToGoogle(product, "store-001");
        expect(result.availability).toBe("out_of_stock");
    });

    it("filters eligible products (has EAN, visible, has price, has photo)", () => {
        const products = [
            baseProduct,
            { ...baseProduct, id: "no-ean", ean: null },
            { ...baseProduct, id: "no-price", price: null },
            { ...baseProduct, id: "hidden", visible: false },
            { ...baseProduct, id: "no-photo", photo_processed_url: null, photo_url: null },
        ];
        const eligible = filterEligibleProducts(products);
        expect(eligible).toHaveLength(1);
        expect(eligible[0].id).toBe("prod-123");
    });

    it("filters out products without any photo", () => {
        const noPhoto = { ...baseProduct, id: "no-photo", photo_processed_url: null, photo_url: null };
        const eligible = filterEligibleProducts([noPhoto]);
        expect(eligible).toHaveLength(0);
    });

    it("accepts product with only photo_url (no processed)", () => {
        const onlyRaw = { ...baseProduct, id: "raw-only", photo_processed_url: null };
        const eligible = filterEligibleProducts([onlyRaw]);
        expect(eligible).toHaveLength(1);
    });
});
