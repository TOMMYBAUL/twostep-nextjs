import { activeFeedSalePrice, type FeedPromoRow } from "@/lib/products/sale-price";
import { isFeedEligible } from "@/lib/google/feed-eligibility";

type ProductRow = {
    id: string;
    name: string;
    canonical_name: string | null;
    description: string | null;
    brand: string | null;
    ean: string | null;
    price: number | null;
    photo_processed_url: string | null;
    photo_url: string | null;
    visible: boolean;
    stock: Array<{ quantity: number }>;
    /** Promos actives jointes par la route (cf. cron/google-feed) — optionnel. */
    promotions?: FeedPromoRow[] | null;
};

type GoogleProduct = {
    offerId: string;
    gtin: string;
    title: string;
    description?: string;
    brand?: string;
    price: { value: string; currency: string };
    /**
     * Prix promo Google (object Price, même forme que `price`). N'est émis QUE pour une promo
     * ACTIVE et réellement avantageuse (`activeFeedSalePrice`). Sans cet attribut, les promos
     * configurées par le marchand ne remontaient JAMAIS sur les surfaces Google (trou D1).
     */
    salePrice?: { value: string; currency: string };
    imageLink: string | null;
    /**
     * Google Merchant Center product attribute spec uses literal strings
     * with a space, not an underscore. Sending "in_stock" causes silent
     * feed rejection. See https://support.google.com/merchants/answer/6324448
     */
    availability: "in stock" | "out of stock";
    channel: "local";
    contentLanguage: "fr";
    targetCountry: "FR";
    condition: "new";
    storeCode: string;
};

/** Google Merchant Center caps the title attribute at 150 characters. */
const TITLE_MAX = 150;

function truncateTitle(s: string): string {
    if (s.length <= TITLE_MAX) return s;
    return s.slice(0, TITLE_MAX - 1).trimEnd() + "…";
}

export function transformProductToGoogle(
    product: ProductRow,
    storeCode: string,
    nowMs: number = Date.now(),
): GoogleProduct {
    const s = (product as any).stock;
    const quantity = !s ? 0 : Array.isArray(s) ? (s[0]?.quantity ?? 0) : (s.quantity ?? 0);

    const out: GoogleProduct = {
        offerId: product.id,
        gtin: product.ean!,
        title: truncateTitle(product.canonical_name ?? product.name),
        price: {
            value: product.price!.toFixed(2),
            currency: "EUR",
        },
        imageLink: product.photo_processed_url ?? product.photo_url,
        availability: quantity > 0 ? "in stock" : "out of stock",
        channel: "local",
        contentLanguage: "fr",
        targetCountry: "FR",
        condition: "new",
        storeCode,
    };

    // Optional fields — only emit when present so we don't send empty strings
    if (product.description) out.description = product.description;
    if (product.brand) out.brand = product.brand;

    // Promo : émise UNIQUEMENT si active + vrai rabais (sale_price < price courant).
    const sale = activeFeedSalePrice(product.price, product.promotions, nowMs);
    if (sale != null) out.salePrice = { value: sale.toFixed(2), currency: "EUR" };

    return out;
}

export function filterEligibleProducts(products: ProductRow[]): ProductRow[] {
    // `visible` est propre à la Voie A (gardé en redondance du gate SQL) ; le reste de
    // l'éligibilité (GTIN/prix/photo) vit dans `isFeedEligible` — source unique partagée avec
    // la Voie B pour garantir le MÊME ensemble de produits émis (fin de divergence price>0/EAN).
    return products.filter((p) => p.visible !== false && isFeedEligible(p));
}
