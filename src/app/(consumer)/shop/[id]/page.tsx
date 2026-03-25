import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import ShopProfileClient from "./shop-profile";

const BASE_URL = "https://www.twostep.fr";

interface Props {
    params: Promise<{ id: string }>;
}

async function getMerchant(id: string) {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from("merchants")
        .select("name, description, city, address, photo_url, logo_url, phone, opening_hours")
        .eq("id", id)
        .single();
    return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params;

    try {
        const data = await getMerchant(id);
        if (!data) return {};

        const title = data.name;
        const description = data.description
            ? `${data.name} — ${data.description.slice(0, 150)}`
            : `${data.name}, ${data.address}, ${data.city}. Découvrez les produits disponibles en boutique sur Two-Step.`;
        const image = data.logo_url || data.photo_url;

        return {
            title,
            description,
            alternates: { canonical: `${BASE_URL}/shop/${id}` },
            openGraph: {
                title: `${data.name} | Two-Step`,
                description,
                url: `${BASE_URL}/shop/${id}`,
                ...(image && {
                    images: [{ url: image, width: 800, height: 800, alt: data.name }],
                }),
            },
            twitter: {
                card: "summary_large_image",
                title: `${data.name} | Two-Step`,
                description,
                ...(image && { images: [image] }),
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
        const data = await getMerchant(id);
        if (data) {
            jsonLd = {
                "@context": "https://schema.org",
                "@type": "LocalBusiness",
                name: data.name,
                description: data.description ?? undefined,
                image: data.logo_url || data.photo_url || undefined,
                url: `${BASE_URL}/shop/${id}`,
                telephone: data.phone ?? undefined,
                address: {
                    "@type": "PostalAddress",
                    streetAddress: data.address,
                    addressLocality: data.city,
                    addressCountry: "FR",
                },
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
            <ShopProfileClient />
        </>
    );
}
