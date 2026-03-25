import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveMerchantId } from "@/lib/slug";
import ShopProfileClient from "./shop-profile";

const BASE_URL = "https://www.twostep.fr";

interface Props {
    params: Promise<{ id: string }>;
}

async function getMerchant(slugOrId: string) {
    const resolvedId = await resolveMerchantId(slugOrId);
    if (!resolvedId) return null;
    const supabase = createAdminClient();
    const { data } = await supabase
        .from("merchants")
        .select("id, slug, name, description, city, address, photo_url, logo_url, phone, opening_hours")
        .eq("id", resolvedId)
        .single();
    return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params;

    try {
        const data = await getMerchant(id);
        if (!data) return {};

        const slug = data.slug;
        const title = data.name;
        const description = data.description
            ? `${data.name} à ${data.city} — ${data.description.slice(0, 120)}. Stock en temps réel sur Two-Step.`
            : `${data.name}, ${data.address}, ${data.city}. Consultez les produits disponibles en boutique et le stock en temps réel sur Two-Step.`;
        const image = data.logo_url || data.photo_url;

        return {
            title,
            description,
            alternates: { canonical: `${BASE_URL}/shop/${slug}` },
            openGraph: {
                title: `${data.name} | Two-Step`,
                description,
                url: `${BASE_URL}/shop/${slug}`,
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

function parseOpeningHours(hours: any): any[] | undefined {
    if (!hours || typeof hours !== "object") return undefined;
    const dayMap: Record<string, string> = {
        lundi: "Monday", mardi: "Tuesday", mercredi: "Wednesday",
        jeudi: "Thursday", vendredi: "Friday", samedi: "Saturday", dimanche: "Sunday",
    };
    const specs: any[] = [];
    for (const [day, value] of Object.entries(hours)) {
        const mapped = dayMap[day.toLowerCase()];
        if (!mapped || !value) continue;
        if (typeof value === "string" && value.includes("-")) {
            const [opens, closes] = value.split("-").map((s: string) => s.trim());
            specs.push({ "@type": "OpeningHoursSpecification", dayOfWeek: mapped, opens, closes });
        }
    }
    return specs.length > 0 ? specs : undefined;
}

export default async function Page({ params }: Props) {
    const { id } = await params;

    let breadcrumbLd = null;
    let jsonLd = null;
    try {
        const data = await getMerchant(id);
        if (data) {
            breadcrumbLd = {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                "itemListElement": [
                    { "@type": "ListItem", position: 1, name: "Accueil", item: BASE_URL },
                    { "@type": "ListItem", position: 2, name: "Boutiques", item: `${BASE_URL}/discover` },
                    { "@type": "ListItem", position: 3, name: data.name, item: `${BASE_URL}/shop/${data.slug}` },
                ],
            };
            jsonLd = {
                "@context": "https://schema.org",
                "@type": "LocalBusiness",
                name: data.name,
                description: data.description ?? undefined,
                image: data.logo_url || data.photo_url || undefined,
                url: `${BASE_URL}/shop/${data.slug}`,
                telephone: data.phone ?? undefined,
                address: {
                    "@type": "PostalAddress",
                    streetAddress: data.address,
                    addressLocality: data.city,
                    addressCountry: "FR",
                },
                ...(data.opening_hours && {
                    openingHoursSpecification: parseOpeningHours(data.opening_hours),
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
            <ShopProfileClient />
        </>
    );
}
