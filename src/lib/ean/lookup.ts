import { createAdminClient } from "@/lib/supabase/admin";
import { createImageJob } from "@/lib/images/jobs";
import { createRateLimiter } from "@/lib/ean/rate-limiter";
import { searchProductImage } from "@/lib/images/serper";

// ── Name similarity scoring for reverse EAN search ──

/** Normalize: lowercase, remove special chars, collapse whitespace */
function normalizeName(s: string): string {
    return s.toLowerCase().replace(/[''`\-/().,"]/g, " ").replace(/\s+/g, " ").trim();
}

/** Levenshtein distance */
function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= n; j++) {
            const tmp = dp[j];
            dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
            prev = tmp;
        }
    }
    return dp[n];
}

/** Score how well a candidate name matches the original product name (0..1) */
function scoreNameMatch(originalName: string, candidateName: string, brand?: string | null): number {
    const normOriginal = normalizeName(brand ? `${brand} ${originalName}` : originalName);
    const normCandidate = normalizeName(candidateName);

    // Levenshtein similarity
    const maxLen = Math.max(normOriginal.length, normCandidate.length);
    if (maxLen === 0) return 1;
    const levScore = 1 - levenshtein(normOriginal, normCandidate) / maxLen;

    // Word overlap: what % of original words appear in the candidate
    const origWords = new Set(normOriginal.split(" ").filter(w => w.length > 2));
    const candWords = new Set(normCandidate.split(" ").filter(w => w.length > 2));
    let overlap = 0;
    for (const w of origWords) { if (candWords.has(w)) overlap++; }
    const overlapScore = origWords.size > 0 ? overlap / origWords.size : 0;

    // Combined: weight word overlap more (avoids penalizing minor formatting differences)
    return levScore * 0.4 + overlapScore * 0.6;
}

const REVERSE_SEARCH_THRESHOLD = 0.55; // Minimum score to accept a reverse search result
const AI_VERIFY_THRESHOLD = 0.85; // Above this score, skip AI verification (high confidence)

type ReverseSearchCandidate = {
    ean: string;
    name: string;
    brand: string | null;
    category: string | null;
    score: number;
};

/**
 * Ask Claude Haiku to verify if an EAN result matches the expected product.
 * Only called for medium-confidence matches (score between 0.55 and 0.85).
 * Cost: ~$0.001 per call.
 */
async function verifyEanMatchWithAI(
    originalName: string,
    candidateName: string,
    brand?: string | null,
): Promise<boolean> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return true; // No API key → accept (fallback to scoring only)

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8_000);

        const productDesc = brand ? `${brand} ${originalName}` : originalName;

        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 20,
                messages: [{
                    role: "user",
                    content: `Le produit sur la facture est : "${productDesc}"
La base de données EAN propose : "${candidateName}"
Est-ce le MÊME produit (même marque, même modèle, même type) ? Les différences de format (volume, contenance, langue) sont acceptables.
Réponds UNIQUEMENT "oui" ou "non".`,
                }],
            }),
            signal: controller.signal,
        });

        clearTimeout(timeout);
        if (!res.ok) return true; // On error, accept rather than block

        const data = await res.json();
        const answer = (data.content?.[0]?.text ?? "").toLowerCase().trim();
        const isMatch = answer.startsWith("oui");

        if (!isMatch && process.env.NODE_ENV === "development") {
            console.log(`[ean-ai] Rejected: "${productDesc}" ≠ "${candidateName}" — AI said: ${answer}`);
        }

        return isMatch;
    } catch {
        return true; // On error, accept
    }
}

/** Pick the best candidate above threshold from a list, with AI verification for uncertain matches */
async function pickBestCandidate(
    candidates: ReverseSearchCandidate[],
    originalName: string,
    brand?: string | null,
): Promise<{ ean: string; brand: string | null; category: string | null } | null> {
    if (candidates.length === 0) return null;

    // Score each candidate
    const scored = candidates.map(c => ({
        ...c,
        score: scoreNameMatch(originalName, c.name, brand),
    })).sort((a, b) => b.score - a.score);

    // Try candidates in score order
    for (const best of scored) {
        if (best.score < REVERSE_SEARCH_THRESHOLD) break; // No more candidates worth checking

        if (best.score >= AI_VERIFY_THRESHOLD) {
            // High confidence — accept without AI check
            return { ean: best.ean, brand: best.brand, category: best.category };
        }

        // Medium confidence — ask AI to verify
        const aiConfirmed = await verifyEanMatchWithAI(originalName, best.name, brand);
        if (aiConfirmed) {
            return { ean: best.ean, brand: best.brand, category: best.category };
        }
        // AI rejected — try next candidate
    }

    return null;
}

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
    // product-search returns { productlist: [...] }, not a plain array
    const items = Array.isArray(data) ? data : (data.productlist ?? []);
    if (items.length === 0 || items[0]?.error) return null;

    // Score all results and pick the best match
    const candidates: ReverseSearchCandidate[] = [];
    for (const item of items.slice(0, 10)) {
        const ean = item.ean ? String(item.ean) : null;
        if (!ean || !/^\d{8,13}$/.test(ean)) continue;
        candidates.push({
            ean,
            name: item.name ? String(item.name) : "",
            brand: null, // EAN-Search doesn't return brand separately
            category: item.categoryName ? String(item.categoryName).toLowerCase() : null,
            score: 0,
        });
    }

    const result = await pickBestCandidate(candidates, productName, brand);
    if (process.env.NODE_ENV === "development") {
        const bestScore = candidates.length > 0
            ? Math.max(...candidates.map(c => scoreNameMatch(productName, c.name, brand)))
            : 0;
        console.log(`[ean-search] "${query}" → ${items.length} results, ${candidates.length} valid, best score: ${bestScore.toFixed(3)}, accepted: ${!!result}`);
    }
    return result;
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
    // 1. EAN-Search (best EU coverage, 1.1B products)
    const eanSearchResult = await searchEanByNameEanSearch(productName, brand);
    if (eanSearchResult) return eanSearchResult;

    // 2. UPCitemdb (good US coverage)
    const upcResult = await searchEanByNameUpc(productName, brand);
    if (upcResult) return upcResult;

    // 3. Open Beauty Facts (cosmetics, skincare, Korean beauty)
    const beautyResult = await searchEanByNameOpenBeautyFacts(productName, brand);
    if (beautyResult) return beautyResult;

    // 4. Open Products Facts (electronics, toys, clothing)
    const productsResult = await searchEanByNameOpenProductsFacts(productName, brand);
    if (productsResult) return productsResult;

    return null;
}

/** UPCitemdb reverse search — scores all results */
async function searchEanByNameUpc(
    productName: string,
    brand?: string | null,
): Promise<{ ean: string; brand: string | null; category: string | null } | null> {
    await upcRateLimiter.acquire();

    const apiKey = process.env.UPCITEMDB_API_KEY;
    if (apiKey === "TODO_SET_YOUR_KEY") return null; // Skip placeholder key
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

    const candidates: ReverseSearchCandidate[] = [];
    for (const item of items.slice(0, 10)) {
        const ean = item.ean ? String(item.ean) : null;
        if (!ean || !/^\d{8,13}$/.test(ean)) continue;
        candidates.push({
            ean,
            name: item.title ? String(item.title) : "",
            brand: item.brand ? String(item.brand) : null,
            category: item.category ? String(item.category).toLowerCase() : null,
            score: 0,
        });
    }

    return await pickBestCandidate(candidates, productName, brand);
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

/**
 * Reverse search via Open Beauty Facts: find EAN from product name.
 * Especially good for Korean/niche cosmetics brands.
 */
async function searchEanByNameOpenBeautyFacts(
    productName: string,
    brand?: string | null,
): Promise<{ ean: string; brand: string | null; category: string | null } | null> {
    const query = brand ? `${brand} ${productName}` : productName;
    const res = await fetchWithRetry(
        `https://world.openbeautyfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&json=1&page_size=10`,
        {},
    );
    if (!res) return null;

    const data = await res.json();
    const products = data.products as Array<Record<string, unknown>> | undefined;
    if (!products || products.length === 0) return null;

    const candidates: ReverseSearchCandidate[] = [];
    for (const product of products) {
        const ean = product.code ? String(product.code) : null;
        if (!ean || !/^\d{8,13}$/.test(ean)) continue;
        candidates.push({
            ean,
            name: product.product_name ? String(product.product_name) : "",
            brand: product.brands ? String(product.brands) : null,
            category: product.categories ? String(product.categories).split(",")[0]?.trim().toLowerCase() : null,
            score: 0,
        });
    }

    return await pickBestCandidate(candidates, productName, brand);
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

/**
 * Reverse search via Open Products Facts: find EAN from product name.
 * Good for electronics, toys, clothing.
 */
async function searchEanByNameOpenProductsFacts(
    productName: string,
    brand?: string | null,
): Promise<{ ean: string; brand: string | null; category: string | null } | null> {
    const query = brand ? `${brand} ${productName}` : productName;
    const res = await fetchWithRetry(
        `https://world.openproductsfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&json=1&page_size=10`,
        {},
    );
    if (!res) return null;

    const data = await res.json();
    const products = data.products as Array<Record<string, unknown>> | undefined;
    if (!products || products.length === 0) return null;

    const candidates: ReverseSearchCandidate[] = [];
    for (const product of products) {
        const ean = product.code ? String(product.code) : null;
        if (!ean || !/^\d{8,13}$/.test(ean)) continue;
        candidates.push({
            ean,
            name: product.product_name ? String(product.product_name) : "",
            brand: product.brands ? String(product.brands) : null,
            category: product.categories ? String(product.categories).split(",")[0]?.trim().toLowerCase() : null,
            score: 0,
        });
    }

    return await pickBestCandidate(candidates, productName, brand);
}

// ── Main lookup — cascade through all sources ──

/**
 * Fetch EAN data from cache or external APIs WITHOUT applying to any product.
 * @param skipCache — set true when caller already checked the cache (avoids double read)
 */
export async function fetchEanData(ean: string, skipCache = false): Promise<EanResult | null> {
    if (!/^\d{8}(\d{4,5})?$/.test(ean)) return null;

    const supabase = createAdminClient();

    // 1. Check our own cache first (instant, free)
    if (!skipCache) {
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

    // Cascade through all sources (skip cache — already checked above)
    const result = await fetchEanData(ean, true);

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
        .select("merchant_id, photo_url, name, brand, sku, category_id")
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
    // Only set category from EAN data if AI hasn't already categorized the product
    if (data.category && prod && !prod.category_id) updateData.category = data.category;
    if (data.name && data.name !== "Unknown") updateData.canonical_name = data.name;

    // Photo: prefer Serper (better e-commerce quality)
    let photoUrl = data.photo_url;
    let photoSource: "ean" | "serper" = "ean";

    if (!photoUrl && prod && !prod.photo_url) {
        const serperUrl = await searchProductImage(
            prod.name,
            data.brand ?? prod.brand,
            ean ?? null,
            prod.sku ?? null,
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
