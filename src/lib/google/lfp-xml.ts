/**
 * Google LFP XML feed builder (Voie B — Phase 3 plan workflow).
 *
 * Source de vérité : brain `04-Partenariats/Google-LFP.md` + spec officielle
 * Google Merchant Center :
 *   https://support.google.com/merchants/answer/7052112 (LFP feed format)
 *   https://support.google.com/merchants/answer/7052112?hl=en#zippy=%2Cxml-format
 *
 * Format : RSS 2.0 + namespace `g:` (xmlns:g="http://base.google.com/ns/1.0").
 *
 * Voie A (existante, `/api/cron/google-feed`) push via Content API. Voie B
 * (cette lib) sert un feed XML que Google crawl périodiquement. Les 2 sont
 * complémentaires — Voie B est le standard "trusted partner" qui scale mieux.
 *
 * Différences vs Voie A `transformProductToGoogle` (src/lib/google/feed.ts) :
 * - JSON → XML
 * - Préfixe namespace `g:` partout
 * - "in stock" / "out of stock" (pas underscore — caused silent rejection
 *   2026-04-22 pre-fix)
 */

import { isFeedEligible } from "@/lib/google/feed-eligibility";
import { activeFeedSalePrice, type FeedPromoRow } from "@/lib/products/sale-price";

const TITLE_MAX = 150;

export interface LfpMerchant {
    id: string;
    name: string;
}

export interface LfpProductRow {
    id: string;
    name: string;
    canonical_name: string | null;
    description: string | null;
    brand: string | null;
    ean: string | null;
    price: number | null;
    photo_url: string | null;
    photo_processed_url: string | null;
    stock: Array<{ quantity: number }> | { quantity: number } | null;
    /** Promos actives jointes par la route — optionnel. */
    promotions?: FeedPromoRow[] | null;
}

/**
 * Filtre les products éligibles au feed LFP : doivent avoir EAN + price + photo.
 * (Le caller doit déjà avoir filtré sur visible=true + review_status=validated.)
 * Délègue à `isFeedEligible` — source unique partagée avec la Voie A (parité, cf. maillon 7).
 */
export function filterFeedEligible(products: LfpProductRow[]): LfpProductRow[] {
    return products.filter(isFeedEligible);
}

/** Échappement XML conformiste (5 char base) — utiliser pour TOUT contenu utilisateur. */
export function escapeXml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function getStockQty(
    s: LfpProductRow["stock"],
): number {
    if (!s) return 0;
    if (Array.isArray(s)) return s[0]?.quantity ?? 0;
    return s.quantity ?? 0;
}

function buildItemXml(p: LfpProductRow, storeCode: string, nowMs: number): string {
    const qty = getStockQty(p.stock);
    const rawTitle = p.canonical_name ?? p.name;
    const title =
        rawTitle.length <= TITLE_MAX
            ? rawTitle
            : rawTitle.slice(0, TITLE_MAX - 1).trimEnd() + "…";
    const photo = p.photo_processed_url ?? p.photo_url ?? "";

    const optDescription = p.description
        ? `\n      <g:description>${escapeXml(p.description)}</g:description>`
        : "";
    const optBrand = p.brand
        ? `\n      <g:brand>${escapeXml(p.brand)}</g:brand>`
        : "";

    // Promo : `g:sale_price` émis UNIQUEMENT pour une promo active + vrai rabais (parité Voie A).
    // Sans cet attribut, les promos marchand ne remontaient pas sur Google (trou D1).
    const sale = activeFeedSalePrice(p.price, p.promotions, nowMs);
    const optSalePrice =
        sale != null ? `\n      <g:sale_price>${sale.toFixed(2)} EUR</g:sale_price>` : "";

    return `    <item>
      <g:id>${escapeXml(p.id)}</g:id>
      <g:gtin>${escapeXml(p.ean!)}</g:gtin>
      <g:title>${escapeXml(title)}</g:title>${optDescription}${optBrand}
      <g:price>${p.price!.toFixed(2)} EUR</g:price>${optSalePrice}
      <g:image_link>${escapeXml(photo)}</g:image_link>
      <g:availability>${qty > 0 ? "in stock" : "out of stock"}</g:availability>
      <g:condition>new</g:condition>
      <g:store_code>${escapeXml(storeCode)}</g:store_code>
      <g:content_language>fr</g:content_language>
      <g:target_country>FR</g:target_country>
      <g:channel>local</g:channel>
    </item>`;
}

/**
 * Construit le feed XML LFP complet pour un marchand.
 *
 * @param merchant — must have id, name
 * @param products — must already be filtered (visible=true + review_status=validated)
 * @param storeCode — store_code Google canonique (cf. resolveStoreCode dans
 *   store-code.ts) ; NE PLUS dériver du slug (divergence Voie A/Voie B corrigée).
 * @returns string XML conforme Google LFP spec
 */
export function buildLfpXml(
    merchant: LfpMerchant,
    products: LfpProductRow[],
    storeCode: string,
    nowMs: number = Date.now(),
): string {
    const eligible = filterFeedEligible(products);
    const items = eligible.map((p) => buildItemXml(p, storeCode, nowMs)).join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Two-Step LFP Feed — ${escapeXml(merchant.name)}</title>
    <link>https://www.twostep.fr</link>
    <description>Local product inventory for Google Merchant Center LFP</description>
${items}
  </channel>
</rss>
`;
}
