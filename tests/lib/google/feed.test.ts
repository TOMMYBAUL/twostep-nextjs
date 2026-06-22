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
        expect(result.availability).toBe("in stock");
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

    it("marks out of stock when quantity is 0", () => {
        const product = { ...baseProduct, stock: [{ quantity: 0 }] };
        const result = transformProductToGoogle(product, "store-001");
        expect(result.availability).toBe("out of stock");
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

    // ─── Parité Voie A/B : la Voie A doit rejeter price<=0 et EAN trop court (avant centralisation
    //     elle les laissait passer alors que la Voie B les rejetait → ensembles divergents). ───
    it("rejette price 0 (parité Voie B — un produit à 0€ ne doit pas partir sur Google)", () => {
        const eligible = filterEligibleProducts([{ ...baseProduct, id: "free", price: 0 }]);
        expect(eligible).toHaveLength(0);
    });

    it("rejette EAN trop court (< 8 chiffres) — parité Voie B", () => {
        const eligible = filterEligibleProducts([{ ...baseProduct, id: "short-ean", ean: "1234" }]);
        expect(eligible).toHaveLength(0);
    });

    // ─── g:sale_price (trou D1 : les promos ne remontaient pas sur Google) ───
    const NOW = Date.parse("2026-06-23T12:00:00Z");
    const activePromo = { sale_price: 99.99, starts_at: "2026-06-01T00:00:00Z", ends_at: "2026-07-01T00:00:00Z" };

    it("émet salePrice pour une promo active et réellement avantageuse", () => {
        const result = transformProductToGoogle({ ...baseProduct, promotions: [activePromo] }, "store-001", NOW);
        expect(result.salePrice).toEqual({ value: "99.99", currency: "EUR" });
    });

    it("n'émet PAS salePrice sans promo", () => {
        const result = transformProductToGoogle(baseProduct, "store-001", NOW);
        expect(result.salePrice).toBeUndefined();
    });

    it("n'émet PAS salePrice si le prix promo n'est pas un vrai rabais (sale_price >= price)", () => {
        const result = transformProductToGoogle(
            { ...baseProduct, promotions: [{ ...activePromo, sale_price: 129.99 }] },
            "store-001",
            NOW,
        );
        expect(result.salePrice).toBeUndefined();
    });

    it("n'émet PAS salePrice pour une promo expirée", () => {
        const result = transformProductToGoogle(
            { ...baseProduct, promotions: [{ ...activePromo, ends_at: "2026-06-10T00:00:00Z" }] },
            "store-001",
            NOW,
        );
        expect(result.salePrice).toBeUndefined();
    });

    it("n'émet PAS salePrice pour une promo pas encore commencée", () => {
        const result = transformProductToGoogle(
            { ...baseProduct, promotions: [{ ...activePromo, starts_at: "2026-07-15T00:00:00Z" }] },
            "store-001",
            NOW,
        );
        expect(result.salePrice).toBeUndefined();
    });

    it("choisit le MEILLEUR rabais quand plusieurs promos actives", () => {
        const result = transformProductToGoogle(
            {
                ...baseProduct,
                promotions: [activePromo, { ...activePromo, sale_price: 79.99 }],
            },
            "store-001",
            NOW,
        );
        expect(result.salePrice).toEqual({ value: "79.99", currency: "EUR" });
    });
});
