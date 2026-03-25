import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import ProductDetailClient from "./product-detail";

interface Props {
    params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params;

    try {
        const supabase = createAdminClient();
        const { data } = await supabase
            .from("products")
            .select("name, price, photo_url, category, merchants(name, city)")
            .eq("id", id)
            .single();

        if (!data) return {};

        const merchant = (data as any).merchants;
        const title = data.name;
        const description = `${data.name}${data.price ? ` — ${data.price.toFixed(2)} €` : ""}${merchant?.name ? ` chez ${merchant.name}` : ""}${merchant?.city ? `, ${merchant.city}` : ""}. Disponible en boutique.`;

        return {
            title,
            description,
            openGraph: {
                title: `${data.name} | Two-Step`,
                description,
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

export default function Page() {
    return <ProductDetailClient />;
}
