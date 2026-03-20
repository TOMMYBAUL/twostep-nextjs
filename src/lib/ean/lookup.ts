import { createAdminClient } from "@/lib/supabase/admin";

type EanResult = {
    name: string;
    brand: string | null;
    photo_url: string | null;
    source: string;
};

export function parseOpenEanResponse(data: Record<string, unknown>): Omit<EanResult, "source"> {
    return {
        name: String(data.name ?? "Unknown"),
        brand: data.brand ? String(data.brand) : null,
        photo_url: data.image ? String(data.image) : null,
    };
}

async function fetchFromOpenEan(ean: string): Promise<EanResult | null> {
    try {
        const res = await fetch(`https://openean.fdcc.info/EANOpenSearch?ean=${ean}&format=json`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.name) return null;
        return { ...parseOpenEanResponse(data), source: "open_ean" };
    } catch {
        return null;
    }
}

async function fetchFromUpcDatabase(ean: string): Promise<EanResult | null> {
    try {
        const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${ean}`);
        if (!res.ok) return null;
        const data = await res.json();
        const item = data.items?.[0];
        if (!item) return null;
        return {
            name: item.title ?? "Unknown",
            brand: item.brand ?? null,
            photo_url: item.images?.[0] ?? null,
            source: "upc_database",
        };
    } catch {
        return null;
    }
}

/**
 * Lookup EAN in cache, then external APIs.
 * Updates product and ean_lookups cache.
 */
export async function lookupEan(ean: string, productId: string): Promise<void> {
    const supabase = createAdminClient();

    // Check cache first
    const { data: cached } = await supabase
        .from("ean_lookups")
        .select("*")
        .eq("ean", ean)
        .single();

    if (cached) {
        // Update product with cached data
        await supabase.from("products").update({
            photo_url: cached.photo_url,
            brand: cached.brand,
        }).eq("id", productId);
        return;
    }

    // Try external APIs
    const result = await fetchFromOpenEan(ean) ?? await fetchFromUpcDatabase(ean);

    if (result) {
        // Cache the result
        await supabase.from("ean_lookups").upsert({
            ean,
            name: result.name,
            brand: result.brand,
            photo_url: result.photo_url,
            source: result.source,
            fetched_at: new Date().toISOString(),
        });

        // Update product
        await supabase.from("products").update({
            photo_url: result.photo_url,
            brand: result.brand,
        }).eq("id", productId);
    }
}
