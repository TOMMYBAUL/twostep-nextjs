import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import ProductDetailClient from "./product-detail";

const BASE_URL = "https://www.twostep.fr";

interface Props {
    params: Promise<{ id: string }>;
}

async function getProduct(id: string) {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from("products")
        .select("name, price, photo_url, category, description, ean, merchants(name, city, address)")
        .eq("id", id)
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
        const description = `${data.name}${data.price ? ` — ${data.price.toFixed(2)} €` : ""}${merchant?.name ? ` chez ${merchant.name}` : ""}${merchant?.city ? `, ${merchant.city}` : ""}. Disponible en boutique.`;

        return {
            title,
            description,
            alternates: { canonical: `${BASE_URL}/product/${id}` },
            openGraph: {
                title: `${data.name} | Two-Step`,
                description,
                url: `${BASE_URL}/product/${id}`,
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

    let jsonLd = null;
    try {
        const data = await getProduct(id);
        if (data) {
            const merchant = (data as any).merchants;
            jsonLd = {
                "@context": "https://schema.org",
                "@type": "Product",
                name: data.name,
                description: data.description ?? undefined,
                image: data.photo_url ?? undefined,
                sku: data.ean ?? undefined,
                category: data.category ?? undefined,
                url: `${BASE_URL}/product/${id}`,
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
