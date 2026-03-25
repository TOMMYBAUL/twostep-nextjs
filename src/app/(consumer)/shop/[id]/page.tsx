import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import ShopProfileClient from "./shop-profile";

interface Props {
    params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params;

    try {
        const supabase = createAdminClient();
        const { data } = await supabase
            .from("merchants")
            .select("name, description, city, address, photo_url, logo_url")
            .eq("id", id)
            .single();

        if (!data) return {};

        const title = data.name;
        const description = data.description
            ? `${data.name} — ${data.description.slice(0, 150)}`
            : `${data.name}, ${data.address}, ${data.city}. Découvrez les produits disponibles en boutique sur Two-Step.`;
        const image = data.logo_url || data.photo_url;

        return {
            title,
            description,
            openGraph: {
                title: `${data.name} | Two-Step`,
                description,
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

export default function Page() {
    return <ShopProfileClient />;
}
