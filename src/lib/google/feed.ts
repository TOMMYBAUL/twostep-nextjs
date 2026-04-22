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
};

type GoogleProduct = {
    offerId: string;
    gtin: string;
    title: string;
    description?: string;
    brand?: string;
    price: { value: string; currency: string };
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

export function transformProductToGoogle(product: ProductRow, storeCode: string): GoogleProduct {
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

    return out;
}

export function filterEligibleProducts(products: ProductRow[]): ProductRow[] {
    return products.filter(
        (p) => p.ean !== null && p.visible !== false && p.price !== null && (p.photo_processed_url !== null || p.photo_url !== null),
    );
}
