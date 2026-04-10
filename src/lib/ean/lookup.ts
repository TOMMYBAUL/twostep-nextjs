import { createAdminClient } from "@/lib/supabase/admin";
import { createImageJob } from "@/lib/images/jobs";
import { createRateLimiter } from "@/lib/ean/rate-limiter";
import { searchProductImage } from "@/lib/images/serper";

export type EanResult = {
    name: string;
    brand: string | null;
    photo_url: string | null;
    category: string | null;
    source: string;
};

// Rate limiter: 6 req/min (free) or 25 req/min (paid, when UPCITEMDB_API_KEY is set)
const upcRateLimiter = createRateLimiter(
    process.env.UPCITEMDB_API_KEY ? 25 : 6,
    60_000,
);

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
    await upcRateLimiter.acquire();

    const apiKey = process.env.UPCITEMDB_API_KEY;
    // Paid plan: /prod/v1/lookup with user_key header
    // Free plan: /prod/trial/lookup without auth
    const url = apiKey
        ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${ean}`
        : `https://api.upcitemdb.com/prod/trial/lookup?upc=${ean}`;
    const headers: Record<string, string> = { "Accept": "application/json" };
    if (apiKey) headers["user_key"] = apiKey;

    const res = await fetchWithRetry(url, { headers });
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
 * Fetch EAN data from cache or external APIs WITHOUT applying to any product.
 * Returns enrichment fields or null if EAN is invalid / not found.
 * Caches the result for future lookups.
 */
export async function fetchEanData(ean: string): Promise<EanResult | null> {
    if (!/^\d{8}(\d{4,5})?$/.test(ean)) return null;

    const supabase = createAdminClient();

    // Check cache first
    const { data: cached } = await supabase
        .from("ean_lookups")
        .select("*")
        .eq("ean", ean)
        .single();

    if (cached) {
        return {
            name: cached.name ?? "Unknown",
            brand: cached.brand ?? null,
            photo_url: cached.photo_url ?? null,
            category: cached.category ?? null,
            source: cached.source ?? "cache",
        };
    }

    // Try external APIs
    const result = await fetchFromUpcDatabase(ean) ?? await fetchFromOpenEan(ean);
    if (!result) return null;

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

    return result;
}

/**
 * Lookup EAN in cache, then external APIs.
 * Updates product and ean_lookups cache.
 */
export async function lookupEan(ean: string, productId: string): Promise<boolean> {
    // Validate EAN format (8, 12, or 13 digits)
    if (!/^\d{8}(\d{4,5})?$/.test(ean)) return false;

    const supabase = createAdminClient();

    // Check cache first
    const { data: cached } = await supabase
        .from("ean_lookups")
        .select("*")
        .eq("ean", ean)
        .single();

    if (cached) {
        await applyEnrichment(supabase, productId, cached, ean);
        return true;
    }

    // Try external APIs: UPCitemdb first (better coverage), then OpenEAN
    const result = await fetchFromUpcDatabase(ean) ?? await fetchFromOpenEan(ean);

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

        await applyEnrichment(supabase, productId, result, ean);
        return true;
    }

    // UPC/OpenEAN didn't find anything — still try Serper for the photo
    // This is critical: many French products aren't in UPC databases
    await applyEnrichment(supabase, productId, { name: null, brand: null, photo_url: null, category: null }, ean);
    return false;
}

async function applyEnrichment(
    supabase: ReturnType<typeof createAdminClient>,
    productId: string,
    data: { name?: string | null; brand?: string | null; photo_url?: string | null; category?: string | null },
    ean?: string,
): Promise<void> {
    const updateData: Record<string, unknown> = {};

    // Fetch current product for validation and photo check
    const { data: prod } = await supabase
        .from("products")
        .select("merchant_id, photo_url, name, brand")
        .eq("id", productId)
        .single();

    // Validate UPC brand coherence — reject if brand doesn't match product name
    // e.g. "Nike Dunk Low" with UPC brand "Partsynergy" → reject UPC brand
    if (data.brand && prod?.name) {
        const productNameLower = prod.name.toLowerCase();
        const upcBrandLower = data.brand.toLowerCase();
        // Accept if brand appears in product name OR product name appears in brand
        const isCoherent =
            productNameLower.includes(upcBrandLower) ||
            upcBrandLower.includes(productNameLower.split(" ")[0]);
        if (!isCoherent) {
            console.warn(`[enrich] UPC brand "${data.brand}" rejected — doesn't match product "${prod.name}"`);
            data.brand = null;
            data.category = null; // category from wrong product is also unreliable
        }
    }

    if (data.brand) updateData.brand = data.brand;
    if (data.category) updateData.category = data.category;
    if (data.name && data.name !== "Unknown") updateData.canonical_name = data.name;

    // Determine photo URL: prefer EAN source, fall back to Serper Google Images
    let photoUrl = data.photo_url;
    let photoSource: "ean" | "serper" = "ean";

    if (!photoUrl && prod && !prod.photo_url) {
        // No photo from EAN databases — try Serper with product name
        const serperUrl = await searchProductImage(
            prod.name,
            data.brand ?? prod.brand,
            ean ?? null,
        );
        if (serperUrl) {
            photoUrl = serperUrl;
            photoSource = "serper";
        }
    }

    const shouldSetPhoto = photoUrl && prod && !prod.photo_url;
    if (shouldSetPhoto) {
        updateData.photo_url = photoUrl;
        updateData.photo_processed_url = null;
        updateData.photo_source = photoSource;
    }

    if (Object.keys(updateData).length > 0) {
        await supabase.from("products").update(updateData).eq("id", productId);
    }

    if (shouldSetPhoto && prod) {
        await createImageJob(productId, prod.merchant_id, photoUrl!, supabase as any);
    }
}
