import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

const BASE_URL = "https://www.twostep.fr";

export const revalidate = 3600; // regenerate sitemap every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const staticRoutes: MetadataRoute.Sitemap = [
        { url: BASE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
        { url: `${BASE_URL}/discover`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
        { url: `${BASE_URL}/explore`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
        { url: `${BASE_URL}/search`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
        { url: `${BASE_URL}/auth/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
        { url: `${BASE_URL}/auth/signup`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    ];

    // Category pages for local SEO
    const categories = ["mode", "chaussures", "bijoux", "sport", "decoration", "boulangeries", "fromageries", "epiceries", "cavistes", "bouchers", "poissonneries", "patisseries", "traiteurs", "primeurs", "chocolatiers"];
    const categoryRoutes: MetadataRoute.Sitemap = categories.map((cat) => ({
        url: `${BASE_URL}/toulouse/${cat}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8,
    }));

    try {
        const supabase = createAdminClient();

        const [{ data: products }, { data: merchants }] = await Promise.all([
            supabase.from("products").select("slug, updated_at").eq("visible", true).is("variant_of", null).order("updated_at", { ascending: false }).limit(1000),
            supabase.from("merchants").select("slug, updated_at").order("updated_at", { ascending: false }).limit(500),
        ]);

        const productRoutes: MetadataRoute.Sitemap = (products ?? []).map((p) => ({
            url: `${BASE_URL}/product/${p.slug}`,
            lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
            changeFrequency: "daily" as const,
            priority: 0.6,
        }));

        const merchantRoutes: MetadataRoute.Sitemap = (merchants ?? []).map((m) => ({
            url: `${BASE_URL}/shop/${m.slug}`,
            lastModified: m.updated_at ? new Date(m.updated_at) : new Date(),
            changeFrequency: "weekly" as const,
            priority: 0.7,
        }));

        return [...staticRoutes, ...categoryRoutes, ...merchantRoutes, ...productRoutes];
    } catch {
        return [...staticRoutes, ...categoryRoutes];
    }
}
