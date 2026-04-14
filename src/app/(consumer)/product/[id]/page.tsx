import React from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { resolveProductId } from "@/lib/slug";
import ProductDetailClient from "./product-detail";
import type { ProductWithMerchant } from "../../types";

const BASE_URL = "https://www.twostep.fr";

interface Props {
    params: Promise<{ id: string }>;
}

const getProduct = React.cache(async function getProduct(slugOrId: string): Promise<ProductWithMerchant | null> {
    const resolvedId = await resolveProductId(slugOrId);
    if (!resolvedId) return null;
    const supabase = await createClient();
    const { data } = await supabase
        .from("products")
        .select("slug, name, canonical_name, price, photo_url, photo_processed_url, category, description, ean, merchant_id, merchants(name, city, address, slug)")
        .eq("id", resolvedId)
        .eq("visible", true)
        .single();
    return data as unknown as ProductWithMerchant | null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params;

    try {
        const data = await getProduct(id);
        if (!data) return {};

        const merchant = data.merchants;
        const displayName = data.canonical_name ?? data.name;
        const title = displayName;
        const description = `${displayName}${data.price ? ` à ${data.price.toFixed(2)} €` : ""}${merchant?.name ? ` chez ${merchant.name}` : ""}${merchant?.city ? ` à ${merchant.city}` : ""}. Vérifiez le stock en temps réel sur Two-Step.`;
        const productSlug = data.slug;

        return {
            title,
            description,
            alternates: { canonical: `${BASE_URL}/product/${productSlug}` },
            openGraph: {
                title: `${displayName} | Two-Step`,
                description,
                url: `${BASE_URL}/product/${productSlug}`,
                ...((data.photo_processed_url || data.photo_url) && {
                    images: [{ url: (data.photo_processed_url ?? data.photo_url) as string, width: 800, height: 800, alt: displayName }],
                }),
            },
            twitter: {
                card: "summary_large_image",
                title: `${displayName} | Two-Step`,
                description,
                ...((data.photo_processed_url || data.photo_url) && { images: [(data.photo_processed_url ?? data.photo_url) as string] }),
            },
        };
    } catch {
        return {};
    }
}

export default async function Page({ params }: Props) {
    const { id } = await params;

    let breadcrumbLd = null;
    let jsonLd = null;
    try {
        const data = await getProduct(id);
        if (data) {
            const merchant = data.merchants;
            const displayName = data.canonical_name ?? data.name;
            breadcrumbLd = {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                "itemListElement": [
                    { "@type": "ListItem", position: 1, name: "Accueil", item: BASE_URL },
                    { "@type": "ListItem", position: 2, name: "Boutiques", item: `${BASE_URL}/discover` },
                    ...(merchant ? [{ "@type": "ListItem", position: 3, name: merchant.name, item: `${BASE_URL}/shop/${merchant.slug}` }] : []),
                    { "@type": "ListItem", position: merchant ? 4 : 3, name: displayName, item: `${BASE_URL}/product/${data.slug}` },
                ],
            };
            jsonLd = {
                "@context": "https://schema.org",
                "@type": "Product",
                name: displayName,
                description: data.description ?? undefined,
                image: (data.photo_processed_url ?? data.photo_url) ?? undefined,
                sku: data.ean ?? undefined,
                category: data.category ?? undefined,
                url: `${BASE_URL}/product/${data.slug}`,
                ...(data.price && {
                    offers: {
                        "@type": "Offer",
                        price: data.price,
                        priceCurrency: "EUR",
                        availability: "https://schema.org/InStoreOnly",
                        ...(merchant && {
                            seller: {
                                "@type": "LocalBusiness",
                                name: merchant.name,
                                address: {
                                    "@type": "PostalAddress",
                                    streetAddress: merchant.address,
                                    addressLocality: merchant.city,
                                    addressCountry: "FR",
                                },
                            },
                        }),
                    },
                }),
            };
        }
    } catch { /* non-critical */ }

    return (
        <>
            {breadcrumbLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
                />
            )}
            {jsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
            )}
            <ProductDetailClient />
        </>
    );
}
