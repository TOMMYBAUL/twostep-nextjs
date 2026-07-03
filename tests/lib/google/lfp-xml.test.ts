import { describe, expect, it } from "vitest";

import {
    buildLfpXml,
    escapeXml,
    filterFeedEligible,
    type LfpProductRow,
} from "@/lib/google/lfp-xml";

const MERCHANT = {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Two-Step Test",
};

const STORE_CODE = "twostep-11111111";

// Stock « in stock » honnête (M5) : source FIABLE (webhook) + source_ts FRAIS + qty > 2.
// Un stock sans source/périmé part désormais « out of stock » (cf. feed-availability.test.ts).
const freshStock = {
    quantity: 5,
    source: "webhook",
    source_ts: new Date(Date.now() - 60_000).toISOString(),
    updated_at: new Date().toISOString(),
};

const baseProduct: LfpProductRow = {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Nike Air Max 90",
    canonical_name: "Nike Air Max 90 Black/White",
    description: "Sneakers iconiques semelle Air visible",
    brand: "Nike",
    ean: "0884776073143",
    price: 129.99,
    photo_url: "https://nike.com/airmax90.jpg",
    photo_processed_url: null,
    stock: [freshStock],
};

describe("escapeXml", () => {
    it("échappe les 5 entités XML standard", () => {
        expect(escapeXml(`<a href="b">it's & </a>`)).toBe(
            "&lt;a href=&quot;b&quot;&gt;it&apos;s &amp; &lt;/a&gt;",
        );
    });

    it("retourne string identique sans char spécial", () => {
        expect(escapeXml("Nike Air Max 90 Black")).toBe("Nike Air Max 90 Black");
    });
});

describe("filterFeedEligible", () => {
    it("rejette product sans EAN", () => {
        const out = filterFeedEligible([{ ...baseProduct, ean: null }]);
        expect(out).toHaveLength(0);
    });

    it("rejette product avec EAN trop court", () => {
        const out = filterFeedEligible([{ ...baseProduct, ean: "1234" }]);
        expect(out).toHaveLength(0);
    });

    it("rejette product sans price", () => {
        const out = filterFeedEligible([{ ...baseProduct, price: null }]);
        expect(out).toHaveLength(0);
    });

    it("rejette product avec price 0", () => {
        const out = filterFeedEligible([{ ...baseProduct, price: 0 }]);
        expect(out).toHaveLength(0);
    });

    it("rejette product sans aucune photo", () => {
        const out = filterFeedEligible([
            { ...baseProduct, photo_url: null, photo_processed_url: null },
        ]);
        expect(out).toHaveLength(0);
    });

    it("accepte product avec photo_url", () => {
        const out = filterFeedEligible([baseProduct]);
        expect(out).toHaveLength(1);
    });

    it("accepte product avec photo_processed_url uniquement", () => {
        const out = filterFeedEligible([
            {
                ...baseProduct,
                photo_url: null,
                photo_processed_url: "https://r2/processed.png",
            },
        ]);
        expect(out).toHaveLength(1);
    });
});

describe("buildLfpXml", () => {
    it("construit RSS 2.0 avec namespace g:", () => {
        const xml = buildLfpXml(MERCHANT, [baseProduct], STORE_CODE);
        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
        expect(xml).toContain("</rss>");
    });

    it("inclut titre du marchand échappé", () => {
        const xml = buildLfpXml({ ...MERCHANT, name: "T&S Boutique" }, [], STORE_CODE);
        expect(xml).toContain("Two-Step LFP Feed — T&amp;S Boutique");
    });

    it("inclut item avec champs Google obligatoires", () => {
        const xml = buildLfpXml(MERCHANT, [baseProduct], STORE_CODE);
        expect(xml).toContain("<g:id>22222222-2222-2222-2222-222222222222</g:id>");
        expect(xml).toContain("<g:gtin>0884776073143</g:gtin>");
        expect(xml).toContain("<g:title>Nike Air Max 90 Black/White</g:title>");
        expect(xml).toContain("<g:price>129.99 EUR</g:price>");
        expect(xml).toContain("<g:image_link>https://nike.com/airmax90.jpg</g:image_link>");
        expect(xml).toContain("<g:availability>in stock</g:availability>");
        expect(xml).toContain("<g:condition>new</g:condition>");
        expect(xml).toContain("<g:store_code>twostep-11111111</g:store_code>");
        expect(xml).toContain("<g:content_language>fr</g:content_language>");
        expect(xml).toContain("<g:target_country>FR</g:target_country>");
        expect(xml).toContain("<g:channel>local</g:channel>");
    });

    it("émet le store_code passé en argument (pas le slug — anti-divergence Voie A/B)", () => {
        const xml = buildLfpXml(MERCHANT, [baseProduct], "twostep-deadbeef");
        expect(xml).toContain("<g:store_code>twostep-deadbeef</g:store_code>");
        expect(xml).not.toContain("two-step-test");
    });

    it("inclut description + brand quand présents", () => {
        const xml = buildLfpXml(MERCHANT, [baseProduct], STORE_CODE);
        expect(xml).toContain("<g:description>Sneakers iconiques semelle Air visible</g:description>");
        expect(xml).toContain("<g:brand>Nike</g:brand>");
    });

    it("omet description + brand quand absents", () => {
        const xml = buildLfpXml(MERCHANT, [
            { ...baseProduct, description: null, brand: null },
        ], STORE_CODE);
        expect(xml).not.toContain("<g:description>");
        expect(xml).not.toContain("<g:brand>");
    });

    it("availability=out of stock quand quantity=0", () => {
        const xml = buildLfpXml(MERCHANT, [
            { ...baseProduct, stock: [{ ...freshStock, quantity: 0 }] },
        ], STORE_CODE);
        expect(xml).toContain("<g:availability>out of stock</g:availability>");
    });

    it("availability=in stock quand stock object (pas array)", () => {
        const xml = buildLfpXml(MERCHANT, [
            { ...baseProduct, stock: { ...freshStock, quantity: 3 } },
        ], STORE_CODE);
        expect(xml).toContain("<g:availability>in stock</g:availability>");
    });

    it("availability=out of stock quand stock null", () => {
        const xml = buildLfpXml(MERCHANT, [
            { ...baseProduct, stock: null },
        ], STORE_CODE);
        expect(xml).toContain("<g:availability>out of stock</g:availability>");
    });

    // ─── Disponibilité HONNÊTE (M5) — parité avec la Voie A (feed.ts) ───
    it("availability=out of stock quand le stock est PÉRIMÉ (webhook > 24 h), item toujours émis", () => {
        const staleTs = new Date(Date.now() - 30 * 3_600_000).toISOString();
        const xml = buildLfpXml(MERCHANT, [
            { ...baseProduct, stock: [{ ...freshStock, source_ts: staleTs, updated_at: staleTs }] },
        ], STORE_CODE);
        expect(xml).toContain("<g:availability>out of stock</g:availability>");
        expect((xml.match(/<item>/g) ?? []).length).toBe(1); // l'offre RESTE dans le feed
    });

    it("availability=out of stock quand la source est MANUELLE, même fraîche", () => {
        const xml = buildLfpXml(MERCHANT, [
            { ...baseProduct, stock: [{ ...freshStock, source: "manual" }] },
        ], STORE_CODE);
        expect(xml).toContain("<g:availability>out of stock</g:availability>");
    });

    it("title tronqué à 150 chars max", () => {
        const longName = "A".repeat(200);
        const xml = buildLfpXml(MERCHANT, [
            { ...baseProduct, canonical_name: longName },
        ], STORE_CODE);
        // 149 'A' + '…' = 150 chars
        const match = xml.match(/<g:title>([^<]+)<\/g:title>/);
        expect(match?.[1].length).toBe(150);
        expect(match?.[1].endsWith("…")).toBe(true);
    });

    it("photo_processed_url prioritaire sur photo_url", () => {
        const xml = buildLfpXml(MERCHANT, [
            {
                ...baseProduct,
                photo_url: "https://nike.com/raw.jpg",
                photo_processed_url: "https://r2/processed.png",
            },
        ], STORE_CODE);
        expect(xml).toContain("<g:image_link>https://r2/processed.png</g:image_link>");
        expect(xml).not.toContain("https://nike.com/raw.jpg");
    });

    it("multiple products → multiple items", () => {
        const xml = buildLfpXml(MERCHANT, [
            baseProduct,
            { ...baseProduct, id: "33333333-3333-3333-3333-333333333333" },
        ], STORE_CODE);
        const itemCount = (xml.match(/<item>/g) ?? []).length;
        expect(itemCount).toBe(2);
    });

    it("filtre les products non éligibles automatiquement", () => {
        const xml = buildLfpXml(MERCHANT, [
            baseProduct,
            { ...baseProduct, id: "44444444-4444-4444-4444-444444444444", ean: null },
        ], STORE_CODE);
        // Seul le 1er passe (le 2e n'a pas d'EAN → filterFeedEligible le rejette)
        const itemCount = (xml.match(/<item>/g) ?? []).length;
        expect(itemCount).toBe(1);
    });

    it("XML valide même avec 0 product (header + channel toujours présents)", () => {
        const xml = buildLfpXml(MERCHANT, [], STORE_CODE);
        expect(xml).toContain("<channel>");
        expect(xml).toContain("</channel>");
        expect(xml).toContain("<rss");
        expect(xml).not.toContain("<item>");
    });

    // ─── g:sale_price (trou D1 — parité avec Voie A salePrice) ───
    const NOW = Date.parse("2026-06-23T12:00:00Z");
    const activePromo = {
        sale_price: 99.99,
        starts_at: "2026-06-01T00:00:00Z",
        ends_at: "2026-07-01T00:00:00Z",
    };

    it("émet g:sale_price pour une promo active et avantageuse", () => {
        const xml = buildLfpXml(MERCHANT, [{ ...baseProduct, promotions: [activePromo] }], STORE_CODE, NOW);
        expect(xml).toContain("<g:sale_price>99.99 EUR</g:sale_price>");
        // toujours après g:price (ordre attendu du feed)
        expect(xml.indexOf("<g:price>")).toBeLessThan(xml.indexOf("<g:sale_price>"));
    });

    it("omet g:sale_price sans promo", () => {
        const xml = buildLfpXml(MERCHANT, [baseProduct], STORE_CODE, NOW);
        expect(xml).not.toContain("<g:sale_price>");
    });

    it("omet g:sale_price si pas un vrai rabais (sale_price >= price)", () => {
        const xml = buildLfpXml(
            MERCHANT,
            [{ ...baseProduct, promotions: [{ ...activePromo, sale_price: 200 }] }],
            STORE_CODE,
            NOW,
        );
        expect(xml).not.toContain("<g:sale_price>");
    });

    it("omet g:sale_price pour une promo expirée", () => {
        const xml = buildLfpXml(
            MERCHANT,
            [{ ...baseProduct, promotions: [{ ...activePromo, ends_at: "2026-06-10T00:00:00Z" }] }],
            STORE_CODE,
            NOW,
        );
        expect(xml).not.toContain("<g:sale_price>");
    });
});
