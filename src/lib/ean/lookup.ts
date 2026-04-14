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

// Rate limiters per service
const upcRateLimiter = createRateLimiter(
    process.env.UPCITEMDB_API_KEY ? 25 : 6,
    60_000,
);
const eanSearchRateLimiter = createRateLimiter(10, 60_000); // ~5000/month = ~10/min safe

export function parseUpcItemDbResponse(data: Record<string, unknown>): Omit<EanResult, "source"> | null {
    const items = data.items as Array<Record<string, unknown>> | undefined;
    const item = items?.[0];
    if (!item) return null;
    return {
        name: item.title ? String(item.title) : "Unknown",
        brand: item.brand ? String(item.brand) : null,
        photo_url: null, // Never use UPCitemdb photos — Serper has better quality
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

// ── EAN-Search.org (PRIMARY — 1.1 billion products, excellent EU coverage) ──

async function fetchFromEanSearch(ean: string): Promise<EanResult | null> {
    const token = process.env.EAN_SEARCH_API_TOKEN;
    if (!token) return null;

    await eanSearchRateLimiter.acquire();

    const res = await fetchWithRetry(
        `https://api.ean-search.org/api?token=${token}&op=barcode-lookup&ean=${ean}&format=json`,
        {},
    );
    if (!res) return null;

    const data = await res.json();
    if (!data || data.error) return null;

    // EAN-Search returns: { name, categoryName, categoryId, issuingCountry }
    const items = Array.isArray(data) ? data : [data];
    const item = items[0];
    if (!item?.name || item.name === "unknown") return null;

    return {
        name: String(item.name),
        brand: null, // EAN-Search doesn't return brand separately
        photo_url: null, // Serper handles photos
        category: item.categoryName ? String(item.categoryName).toLowerCase() : null,
        source: "ean_search",
    };
}

/**
 * Reverse search via EAN-Search.org: find EAN from product name.
 */
export async function searchEanByNameEanSearch(
    productName: string,
    brand?: string | null,
): Promise<{ ean: string; brand: string | null; category: string | null } | null> {
    const token = process.env.EAN_SEARCH_API_TOKEN;
    if (!token) return null;

    await eanSearchRateLimiter.acquire();

    const query = brand ? `${brand} ${productName}` : productName;
    const res = await fetchWithRetry(
        `https://api.ean-search.org/api?token=${token}&op=product-search&name=${encodeURIComponent(query)}&format=json`,
        {},
    );
    if (!res) return null;

    const data = await res.json();
    const items = Array.isArray(data) ? data : [];
    if (items.length === 0 || items[0]?.error) return null;

    const item = items[0];
    const ean = item.ean ? String(item.ean) : null;
    if (!ean || !/^\d{8,13}$/.test(ean)) return null;

    return {
        ean,
        brand: null,
        category: item.categoryName ? String(item.categoryName).toLowerCase() : null,
    };
}

// ── UPCitemdb (SECONDARY — US-centric, free tier) ──

async function fetchFromUpcDatabase(ean: string): Promise<EanResult | null> {
    await upcRateLimiter.acquire();

    const apiKey = process.env.UPCITEMDB_API_KEY;
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

/**
 * Reverse search via UPCitemdb: find EAN from product name.
 */
export async function searchEanByName(
    productName: string,
    brand?: string | null,
): Promise<{ ean: string; brand: string | null; category: string | null } | null> {
    // Try EAN-Search first (better EU coverage)
    const eanSearchResult = await searchEanByNameEanSearch(productName, brand);
    if (eanSearchResult) return eanSearchResult;

    // Fallback to UPCitemdb
    await upcRateLimiter.acquire();

    const apiKey = process.env.UPCITEMDB_API_KEY;
    const query = brand ? `${brand} ${productName}` : productName;
    const url = apiKey
        ? `https://api.upcitemdb.com/prod/v1/search?s=${encodeURIComponent(query)}&type=product`
        : `https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(query)}&type=product`;
    const headers: Record<string, string> = { "Accept": "application/json" };
    if (apiKey) headers["user_key"] = apiKey;

    const res = await fetchWithRetry(url, { headers });
    if (!res) return null;

    const data = await res.json();
    const items = data.items as Array<Record<string, unknown>> | undefined;
    if (!items || items.length === 0) return null;

    const item = items[0];
    const ean = item.ean ? String(item.ean) : null;
    if (!ean || !/^\d{8,13}$/.test(ean)) return null;

    return {
        ean,
        brand: item.brand ? String(item.brand) : null,
        category: item.category ? String(item.category).toLowerCase() : null,
    };
}

// ── Open Beauty Facts (FREE — cosmetics, skincare) ──

async function fetchFromOpenBeautyFacts(ean: string): Promise<EanResult | null> {
    const res = await fetchWithRetry(
        `https://world.openbeautyfacts.org/api/v2/product/${ean}.json`,
        {},
    );
    if (!res) return null;

    const data = await res.json();
    if (!data?.product || data.status === 0) return null;

    const product = data.product;
    return {
        name: product.product_name ?? "Unknown",
        brand: product.brands ?? null,
        photo_url: null, // Serper handles photos
        category: product.categories ? String(product.categories).split(",")[0]?.trim().toLowerCase() : null,
        source: "open_beauty_facts",
    };
}

// ── Open Products Facts (FREE — electronics, toys, clothes) ──

async function fetchFromOpenProductsFacts(ean: string): Promise<EanResult | null> {
    const res = await fetchWithRetry(
        `https://world.openproductsfacts.org/api/v2/product/${ean}.json`,
        {},
    );
    if (!res) return null;

    const data = await res.json();
    if (!data?.product || data.status === 0) return null;

    const product = data.product;
    return {
        name: product.product_name ?? "Unknown",
        brand: product.brands ?? null,
        photo_url: null,
        category: product.categories ? String(product.categories).split(",")[0]?.trim().toLowerCase() : null,
        source: "open_products_facts",
    };
}

// ── Main lookup — cascade through all sources ──

/**
 * Fetch EAN data from cache or external APIs WITHOUT applying to any product.
 */
export async function fetchEanData(ean: string): Promise<EanResult | null> {
    if (!/^\d{8}(\d{4,5})?$/.test(ean)) return null;

    const supabase = createAdminClient();

    // 1. Check our own cache first (instant, free)
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

    // 2. EAN-Search.org (primary — best EU coverage, 1.1 billion products)
    const eanSearchResult = await fetchFromEanSearch(ean);
    if (eanSearchResult) {
        await cacheResult(supabase, ean, eanSearchResult);
        return eanSearchResult;
    }

    // 3. UPCitemdb (secondary — good US coverage)
    const upcResult = await fetchFromUpcDatabase(ean);
    if (upcResult) {
        await cacheResult(supabase, ean, upcResult);
        return upcResult;
    }

    // 4. Open Beauty Facts (free — cosmetics/skincare)
    const beautyResult = await fetchFromOpenBeautyFacts(ean);
    if (beautyResult) {
        await cacheResult(supabase, ean, beautyResult);
        return beautyResult;
    }

    // 5. Open Products Facts (free — electronics, toys, clothes)
    const productsResult = await fetchFromOpenProductsFacts(ean);
    if (productsResult) {
        await cacheResult(supabase, ean, productsResult);
        return productsResult;
    }

    return null;
}

async function cacheResult(
    supabase: ReturnType<typeof createAdminClient>,
    ean: string,
    result: EanResult,
): Promise<void> {
    await supabase.from("ean_lookups").upsert({
        ean,
        name: result.name,
        brand: result.brand,
        photo_url: result.photo_url,
        category: result.category,
        source: result.source,
        fetched_at: new Date().toISOString(),
    });
}

/**
 * Lookup EAN in cache, then cascade through all external APIs.
 * Updates product and ean_lookups cache.
 */
export async function lookupEan(ean: string, productId: string): Promise<boolean> {
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

    // Cascade through all sources
    const result = await fetchEanData(ean);

    if (result) {
        await applyEnrichment(supabase, productId, result, ean);
        return true;
    }

    // No source found anything — still try Serper for the photo
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

    const { data: prod } = await supabase
        .from("products")
        .select("merchant_id, photo_url, name, brand, sku")
        .eq("id", productId)
        .single();

    // Validate UPC brand coherence
    if (data.brand && prod?.name) {
        const productNameLower = prod.name.toLowerCase();
        const upcBrandLower = data.brand.toLowerCase();
        const isCoherent =
            productNameLower.includes(upcBrandLower) ||
            upcBrandLower.includes(productNameLower.split(" ")[0]);
        if (!isCoherent) {
            data.brand = null;
            data.category = null;
        }
    }

    if (data.brand) updateData.brand = data.brand;
    if (data.category) updateData.category = data.category;
    if (data.name && data.name !== "Unknown") updateData.canonical_name = data.name;

    // Photo: prefer Serper (better e-commerce quality)
    let photoUrl = data.photo_url;
    let photoSource: "ean" | "serper" = "ean";

    if (!photoUrl && prod && !prod.photo_url) {
        const serperUrl = await searchProductImage(
            prod.name,
            data.brand ?? prod.brand,
            ean ?? null,
            (prod as any).sku ?? null,
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
