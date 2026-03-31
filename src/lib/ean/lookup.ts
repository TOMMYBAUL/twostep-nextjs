import { createAdminClient } from "@/lib/supabase/admin";
import { createImageJob } from "@/lib/images/jobs";
import { createRateLimiter } from "@/lib/ean/rate-limiter";

type EanResult = {
    name: string;
    brand: string | null;
    photo_url: string | null;
    category: string | null;
    source: string;
};

// Rate limiter: 25 requests/minute (UPCitemdb paid plan)
const upcRateLimiter = createRateLimiter(25, 60_000);

export function parseOpenEanResponse(data: Record<string, unknown>): Omit<EanResult, "source"> {
    return {
        name: String(data.name ?? "Unknown"),
        brand: data.brand ? String(data.brand) : null,
        photo_url: data.image ? String(data.image) : null,
        category: data.category_name ? String(data.category_name).toLowerCase() : null,
    };
}

export function parseUpcItemDbResponse(data: Record<string, unknown>): Omit<EanResult, "source"> | null {
    const items = data.items as Array<Record<string, unknown>> | undefined;
    const item = items?.[0];
    if (!item) return null;
    return {
        name: item.title ? String(item.title) : "Unknown",
        brand: item.brand ? String(item.brand) : null,
        photo_url: Array.isArray(item.images) && item.images.length > 0 ? String(item.images[0]) : null,
        category: item.category ? String(item.category).toLowerCase() : null,
    };
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 1): Promise<Response | null> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5_000);
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeout);
            if (res.status === 429) return null; // Rate limited — let cron retry
            if (res.ok) return res;
        } catch {
            if (attempt === retries) return null;
        }
    }
    return null;
}

async function fetchFromUpcDatabase(ean: string): Promise<EanResult | null> {
    const apiKey = process.env.UPCITEMDB_API_KEY;
    if (!apiKey) return null;

    await upcRateLimiter.acquire();

    const res = await fetchWithRetry(
        `https://api.upcitemdb.com/prod/v1/lookup?upc=${ean}`,
        { headers: { "user_key": apiKey, "Accept": "application/json" } },
    );
    if (!res) return null;

    const data = await res.json();
    const parsed = parseUpcItemDbResponse(data);
    if (!parsed) return null;
    return { ...parsed, source: "upc_database" };
}

async function fetchFromOpenEan(ean: string): Promise<EanResult | null> {
    const res = await fetchWithRetry(
        `https://openean.fdcc.info/EANOpenSearch?ean=${ean}&format=json`,
        {},
    );
    if (!res) return null;

    const data = await res.json();
    if (!data?.name) return null;
    return { ...parseOpenEanResponse(data), source: "open_ean" };
}

/**
 * Lookup EAN in cache, then external APIs.
 * Updates product and ean_lookups cache.
 */
export async function lookupEan(ean: string, productId: string): Promise<boolean> {
    const supabase = createAdminClient();

    // Check cache first
    const { data: cached } = await supabase
        .from("ean_lookups")
        .select("*")
        .eq("ean", ean)
        .single();

    if (cached) {
        await applyEnrichment(supabase, productId, cached);
        return true;
    }

    // Try external APIs: UPCitemdb first (better coverage), then OpenEAN
    const result = await fetchFromUpcDatabase(ean) ?? await fetchFromOpenEan(ean);
    if (!result) return false;

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

    await applyEnrichment(supabase, productId, result);
    return true;
}

async function applyEnrichment(
    supabase: ReturnType<typeof createAdminClient>,
    productId: string,
    data: { name?: string | null; brand?: string | null; photo_url?: string | null; category?: string | null },
): Promise<void> {
    const updateData: Record<string, unknown> = {};

    if (data.brand) updateData.brand = data.brand;
    if (data.category) updateData.category = data.category;
    if (data.name && data.name !== "Unknown") updateData.canonical_name = data.name;
    if (data.photo_url) updateData.photo_url = data.photo_url;

    if (Object.keys(updateData).length > 0) {
        await supabase.from("products").update(updateData).eq("id", productId);
    }

    if (data.photo_url) {
        const { data: prod } = await supabase.from("products").select("merchant_id, photo_processed_url").eq("id", productId).single();
        if (prod && !prod.photo_processed_url) {
            await createImageJob(productId, prod.merchant_id, data.photo_url);
        }
    }
}
