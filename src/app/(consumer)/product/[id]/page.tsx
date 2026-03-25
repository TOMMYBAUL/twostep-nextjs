import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveProductId } from "@/lib/slug";
import ProductDetailClient from "./product-detail";

const BASE_URL = "https://www.twostep.fr";

interface Props {
    params: Promise<{ id: string }>;
}

async function getProduct(slugOrId: string) {
    const resolvedId = await resolveProductId(slugOrId);
    if (!resolvedId) return null;
    const supabase = createAdminClient();
    const { data } = await supabase
        .from("products")
        .select("slug, name, price, photo_url, category, description, ean, merchant_id, merchants(name, city, address, slug)")
        .eq("id", resolvedId)
        .single();
    return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params;

    try {
        const data = await getProduct(id);
        if (!data) return {};

        const merchant = (data as any).merchants;
        const title = data.name;
        const description = `${data.name}${data.price ? ` à ${data.price.toFixed(2)} €` : ""}${merchant?.name ? ` chez ${merchant.name}` : ""}${merchant?.city ? ` à ${merchant.city}` : ""}. Vérifiez le stock en temps réel sur Two-Step.`;
        const productSlug = data.slug;

        return {
            title,
            description,
            alternates: { canonical: `${BASE_URL}/product/${productSlug}` },
            openGraph: {
                title: `${data.name} | Two-Step`,
                description,
                url: `${BASE_URL}/product/${productSlug}`,
                ...(data.photo_url && {
                    images: [{ url: data.photo_url, width: 800, height: 800, alt: data.name }],
                }),
            },
            twitter: {
                card: "summary_large_image",
                title: `${data.name} | Two-Step`,
                description,
                ...(data.photo_url && { images: [data.photo_url] }),
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
            const merchant = (data as any).merchants;
            breadcrumbLd = {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                "itemListElement": [
                    { "@type": "ListItem", position: 1, name: "Accueil", item: BASE_URL },
                    { "@type": "ListItem", position: 2, name: "Boutiques", item: `${BASE_URL}/discover` },
                    ...(merchant ? [{ "@type": "ListItem", position: 3, name: merchant.name, item: `${BASE_URL}/shop/${merchant.slug}` }] : []),
                    { "@type": "ListItem", position: merchant ? 4 : 3, name: data.name, item: `${BASE_URL}/product/${data.slug}` },
                ],
            };
            jsonLd = {
                "@context": "https://schema.org",
                "@type": "Product",
                name: data.name,
                description: data.description ?? undefined,
                image: data.photo_url ?? undefined,
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
