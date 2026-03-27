import { createAdminClient } from "@/lib/supabase/admin";
import { createImageJob } from "@/lib/images/jobs";

type EanResult = {
    name: string;
    brand: string | null;
    photo_url: string | null;
    category: string | null;
    source: string;
};

export function parseOpenEanResponse(data: Record<string, unknown>): Omit<EanResult, "source"> {
    return {
        name: String(data.name ?? "Unknown"),
        brand: data.brand ? String(data.brand) : null,
        photo_url: data.image ? String(data.image) : null,
        category: data.category_name ? String(data.category_name) : null,
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
            category: item.category ?? null,
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
        const updateData: Record<string, unknown> = {
            photo_url: cached.photo_url,
            brand: cached.brand,
            category: cached.category,
        };
        // Replace product name with canonical name if the cached name is richer
        if (cached.name && cached.name !== "Unknown") {
            updateData.canonical_name = cached.name;
        }
        await supabase.from("products").update(updateData).eq("id", productId);
        if (cached.photo_url) {
            const { data: prod } = await supabase.from("products").select("merchant_id").eq("id", productId).single();
            if (prod) await createImageJob(productId, prod.merchant_id, cached.photo_url, supabase as any);
        }
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
            category: result.category,
            source: result.source,
            fetched_at: new Date().toISOString(),
        });

        // Update product — canonical_name is the authoritative EAN-sourced name
        const updateData: Record<string, unknown> = {
            photo_url: result.photo_url,
            brand: result.brand,
            category: result.category,
        };
        if (result.name && result.name !== "Unknown") {
            updateData.canonical_name = result.name;
        }
        await supabase.from("products").update(updateData).eq("id", productId);
        if (result.photo_url) {
            const { data: prod } = await supabase.from("products").select("merchant_id").eq("id", productId).single();
            if (prod) await createImageJob(productId, prod.merchant_id, result.photo_url, supabase as any);
        }
    }
}
