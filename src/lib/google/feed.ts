type ProductRow = {
    id: string;
    name: string;
    canonical_name: string | null;
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
    price: { value: string; currency: string };
    imageLink: string | null;
    availability: "in_stock" | "out_of_stock";
    channel: "local";
    contentLanguage: "fr";
    targetCountry: "FR";
    condition: "new";
    storeCode: string;
};

export function transformProductToGoogle(product: ProductRow, storeCode: string): GoogleProduct {
    const quantity = product.stock?.[0]?.quantity ?? 0;

    return {
        offerId: product.id,
        gtin: product.ean!,
        title: product.canonical_name ?? product.name,
        price: {
            value: product.price!.toFixed(2),
            currency: "EUR",
        },
        imageLink: product.photo_processed_url ?? product.photo_url,
        availability: quantity > 0 ? "in_stock" : "out_of_stock",
        channel: "local",
        contentLanguage: "fr",
        targetCountry: "FR",
        condition: "new",
        storeCode,
    };
}

export function filterEligibleProducts(products: ProductRow[]): ProductRow[] {
    return products.filter(
        (p) => p.ean !== null && p.visible !== false && p.price !== null,
    );
}
