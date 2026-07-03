import { activeFeedSalePrice, type FeedPromoRow } from "@/lib/products/sale-price";
import { feedAvailability, type FeedStockRow } from "@/lib/google/feed-availability";
import { gtinOnlyTierEnabled, isFeedEligible } from "@/lib/google/feed-eligibility";

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
    /**
     * Embed `stock(quantity, source, source_ts, updated_at)` — PostgREST renvoie objet OU
     * tableau. `source`/`source_ts` sont REQUIS par la disponibilité honnête (M5) : un SELECT
     * qui ne les apporte pas fait retomber `feedAvailability` sur « out of stock » (conservateur).
     */
    stock: FeedStockRow[] | FeedStockRow | null;
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
    /**
     * Émis UNIQUEMENT quand le produit a une image. En tier GTIN-only (D2, flag), un produit
     * sans image part SANS `imageLink` → Google matche par GTIN (un `imageLink: null` explicite
     * serait rejeté). Tant que le flag est OFF, l'éligibilité exige une image → toujours présent.
     */
    imageLink?: string;
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
    const out: GoogleProduct = {
        offerId: product.id,
        gtin: product.ean!,
        title: truncateTitle(product.canonical_name ?? product.name),
        price: {
            value: product.price!.toFixed(2),
            currency: "EUR",
        },
        // Disponibilité HONNÊTE (M5) — plus jamais le `quantity > 0` brut : source unique
        // `feedAvailability` (fraîcheur source_ts + force de source), parité Voie B/preview.
        availability: feedAvailability(product.stock, nowMs),
        channel: "local",
        contentLanguage: "fr",
        targetCountry: "FR",
        condition: "new",
        storeCode,
    };

    // Optional fields — only emit when present so we don't send empty strings
    const image = product.photo_processed_url ?? product.photo_url;
    if (image) out.imageLink = image;
    if (product.description) out.description = product.description;
    if (product.brand) out.brand = product.brand;

    // Promo : émise UNIQUEMENT si active + vrai rabais (sale_price < price courant).
    const sale = activeFeedSalePrice(product.price, product.promotions, nowMs);
    if (sale != null) out.salePrice = { value: sale.toFixed(2), currency: "EUR" };

    return out;
}

export function filterEligibleProducts(
    products: ProductRow[],
    // Tier GTIN-only (D2) : lu via le flag par défaut → parité avec la Voie B (même flag).
    // Override explicite pour les tests. OFF en prod tant que `GOOGLE_GTIN_ONLY_TIER` non posé.
    allowMissingImage: boolean = gtinOnlyTierEnabled(),
): ProductRow[] {
    // `visible` est propre à la Voie A (gardé en redondance du gate SQL) ; le reste de
    // l'éligibilité (GTIN/prix/photo) vit dans `isFeedEligible` — source unique partagée avec
    // la Voie B pour garantir le MÊME ensemble de produits émis (fin de divergence price>0/EAN).
    return products.filter((p) => p.visible !== false && isFeedEligible(p, { allowMissingImage }));
}
