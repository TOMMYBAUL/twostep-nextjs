import { createAdminClient } from "@/lib/supabase/admin";
import { extractKnownBrand } from "@/lib/ean/brand";
import { mapEanCategoryToFr } from "@/lib/ean/category";
import { createImageJob } from "@/lib/images/jobs";
import { createRateLimiter } from "@/lib/ean/rate-limiter";
import { searchProductImage } from "@/lib/images/serper";
import { extractOpenFactsImage } from "@/lib/ean/open-facts-image";
import { logCacheHit, logCacheMiss } from "@/lib/enrichment/telemetry";
import { uploadPhotoToR2 } from "@/lib/enrichment/cache-photo-r2";
import { captureError } from "@/lib/error";

// ── Cache NÉGATIF (C1, 2026-07-04) ──
//
// Problème : un EAN introuvable partout n'écrivait RIEN dans `ean_lookups` →
// le sélecteur d'enrichissement (canonical_name null) le re-présentait à CHAQUE
// run du cron (toutes les 2 h) → 4 lookups externes + Serper + vision re-payés
// indéfiniment pour le même échec. On écrit désormais un MARQUEUR négatif
// (`source='not_found'`, name='' — NOT NULL oblige) avec TTL : tant qu'il est
// frais, aucune re-tentative externe ; expiré, on re-tente (les bases EAN
// s'enrichissent avec le temps).
//
// Zéro faux positif : le marqueur ne publie RIEN (name vide, jamais appliqué à
// un produit, `canonical_name_normalized` reste null → invisible de la recherche
// fuzzy 083 qui filtre IS NOT NULL). Il ne fait que bloquer les re-achats.
// Un succès ultérieur (cascade, reverse-search) l'écrase via l'upsert (PK ean).
//
// ⚠️ Limite assumée (documentée) : les fetchFromX ne distinguent pas « répondu
// introuvable » d'« erreur réseau/quota » → une panne totale des 4 sources peut
// poser un marqueur. Borné par le TTL, et visible (le run est loggé failed).
export const EAN_NOT_FOUND_SOURCE = "not_found";
export const EAN_NOT_FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000; // ~30 jours

/** Une ligne `ean_lookups` est-elle un marqueur négatif (peu importe sa fraîcheur) ? */
export function isNotFoundMarker(row: { source?: string | null } | null | undefined): boolean {
    return row?.source === EAN_NOT_FOUND_SOURCE;
}

/**
 * Marqueur négatif encore FRAIS (< TTL) → bloque les re-tentatives externes.
 * `fetched_at` absent/illisible → considéré PÉRIMÉ (on re-tente : la re-tentative
 * ré-écrit une date valide, donc pas de boucle ; coverage > économie sur ce cas limite).
 */
export function isFreshNotFound(
    row: { source?: string | null; fetched_at?: string | null } | null | undefined,
    nowMs: number = Date.now(),
): boolean {
    if (!row || !isNotFoundMarker(row)) return false;
    if (!row.fetched_at) return false;
    const fetchedMs = Date.parse(row.fetched_at);
    if (Number.isNaN(fetchedMs)) return false;
    return nowMs - fetchedMs < EAN_NOT_FOUND_TTL_MS;
}

// ── Name similarity scoring for reverse EAN search ──

/** Normalize: lowercase, remove special chars, collapse whitespace */
export function normalizeName(s: string): string {
    return s.toLowerCase().replace(/[''`\-/().,"]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Build a query string suitable for external EAN search APIs (EAN-Search, UPCitemdb, etc.).
 * These APIs are strict on punctuation and prefer short discriminating queries.
 *
 * Strategy:
 *   1. Normalize (lowercase, strip apostrophes/slashes/quotes/punctuation)
 *   2. Drop tokens shorter than 2 chars (noise)
 *   3. Take the first 6 tokens — usually brand + model + key descriptors
 *
 * Brand is prepended only if it isn't already present in the normalized name.
 */
export function buildExternalSearchQuery(name: string, brand?: string | null): string {
    const normalizedName = normalizeName(name);
    const normalizedBrand = brand ? normalizeName(brand) : null;

    // Keep tokens of >=2 chars OR pure digits (model numbers like "1", "3", "5" matter)
    const tokens = normalizedName.split(" ").filter(t => t.length >= 2 || /^\d+$/.test(t));

    if (normalizedBrand && !tokens.includes(normalizedBrand)) {
        tokens.unshift(normalizedBrand);
    }

    return tokens.slice(0, 6).join(" ");
}

/**
 * Words that indicate a product name is a placeholder / too generic to reverse-search
 * safely. These names produce high-scoring but semantically wrong matches (e.g. "Produit 1"
 * matching a random Dutch placeholder also called "Produit 1").
 */
const GENERIC_NAME_BLACKLIST = new Set([
    "produit", "article", "item", "test", "chose", "sku", "ref",
    "default", "placeholder", "unknown", "none",
]);

/**
 * Decide if a product name is rich enough to reverse-search on external APIs.
 * Returns false (too vague) when:
 *   - After normalization, fewer than 3 significant tokens remain
 *   - OR any token is in the generic blacklist (produit, article, item, ...)
 */
export function isNameRichEnoughForReverseSearch(name: string, brand?: string | null): boolean {
    const normalized = normalizeName(name);
    const tokens = normalized.split(" ").filter(t => t.length >= 2 || /^\d+$/.test(t));

    if (tokens.some(t => GENERIC_NAME_BLACKLIST.has(t))) return false;

    // Brand counts as a significant token — a Nike name is less risky than an unnamed one
    const effectiveTokens = brand ? tokens.length + 1 : tokens.length;
    return effectiveTokens >= 2;
}

/**
 * Match the SQL normalization used by `canonical_name_normalized` in ean_lookups.
 * SQL backfill: `lower(regexp_replace(name, '[^a-z0-9\s]', '', 'gi'))`.
 * Keep these two in sync — the pg_trgm index relies on identical normalization.
 */
function normalizeForCache(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9\s]/gi, "");
}

/** Levenshtein distance */
export function levenshtein(a: string, b: string): number {
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
export function scoreNameMatch(originalName: string, candidateName: string, brand?: string | null): number {
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

// Lowered from 0.55 → 0.40: short candidate names (e.g. "Nike Air Force 1 07")
// match long POS names (e.g. "Nike Air Force 1 '07 Men's White/White US7") at
// only ~0.48 because of the length asymmetry. Letting AI verify decide is safer
// than rejecting outright, since AI verify is now MANDATORY (see pickBestCandidate).
const REVERSE_SEARCH_THRESHOLD = 0.40;
// AI_VERIFY_THRESHOLD kept for reference — pickBestCandidate now ignores it and
// always calls verifyEanMatchWithAI to catch high-score semantic false positives.
const AI_VERIFY_THRESHOLD = 0.85;

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
export async function verifyEanMatchWithAI(
    originalName: string,
    candidateName: string,
    brand?: string | null,
): Promise<boolean> {
    // Same provider strategy as categorize.ts: Groq (free 14k req/day) → Gemini fallback.
    // Anthropic kept as last resort if both gratuites are down.
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!groqKey && !geminiKey && !anthropicKey) {
        console.warn(`[ean-ai] No AI provider key set — refusing match by default (safe-fail)`);
        return false;
    }

    const productDesc = brand ? `${brand} ${originalName}` : originalName;

    const prompt = `Tu valides un appariement de produits. Réponds UNIQUEMENT par "oui" ou "non".

Produit du marchand : "${productDesc}"
Candidat dans la base EAN : "${candidateName}"

Critères STRICTS pour répondre "oui" :
1. Même type de produit (sneaker = sneaker, tshirt = tshirt, casque = casque)
2. Si le candidat ajoute une MARQUE absente du nom marchand → "non" (jamais inventer une marque)
3. Si le candidat ajoute un MODÈLE/RÉFÉRENCE absent du nom marchand → "non" (jamais inventer un modèle)
4. Variations acceptables : casse, accents, ordre des mots, langue, format/contenance

Exemples :
- "tshirt noir" vs "Oui Tshirt noir" → non (Oui = marque inventée)
- "pull rouge" vs "Lacoste Pull Rouge XL" → non (Lacoste + XL inventés)
- "Casque audio Bose" vs "Bose QC45 ANC Wireless" → non (QC45 = modèle non précisé)
- "Bose QuietComfort 35 Black" vs "Bose QuietComfort 35 II - Black" → non (II = variante précisée non mentionnée)
- "Adidas Samba OG" vs "adidas Samba Og" → oui (identique)
- "Apple iPhone 15 128GB Noir" vs "Iphone 15 128Gb noir - APPLE" → oui (mêmes spécifs, ordre différent)
- "Nike Air Force 1 '07 Men's White" vs "Nike Air Force 1 07 White" → oui (mêmes spécifs)

En cas de doute → "non".`;

    let answer = "";

    // 1) Groq — free, fast
    if (groqKey) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8_000);
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${groqKey}`,
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0,
                    max_tokens: 10,
                }),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            if (res.ok) {
                const data = await res.json();
                answer = (data.choices?.[0]?.message?.content ?? "").toLowerCase().trim();
            } else {
                console.warn(`[ean-ai] Groq HTTP ${res.status} — trying Gemini`);
            }
        } catch (err) {
            console.warn(`[ean-ai] Groq error — trying Gemini:`, err);
        }
    }

    // 2) Gemini fallback
    if (!answer && geminiKey) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8_000);
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0, maxOutputTokens: 10 },
                    }),
                    signal: controller.signal,
                },
            );
            clearTimeout(timeout);
            if (res.ok) {
                const data = await res.json();
                answer = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").toLowerCase().trim();
            } else {
                console.warn(`[ean-ai] Gemini HTTP ${res.status} — trying Anthropic`);
            }
        } catch (err) {
            console.warn(`[ean-ai] Gemini error — trying Anthropic:`, err);
        }
    }

    // 3) Anthropic last-resort
    if (!answer && anthropicKey) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8_000);
            const res = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": anthropicKey,
                    "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify({
                    model: "claude-haiku-4-5-20251001",
                    max_tokens: 10,
                    messages: [{ role: "user", content: prompt }],
                }),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            if (res.ok) {
                const data = await res.json();
                answer = (data.content?.[0]?.text ?? "").toLowerCase().trim();
            }
        } catch (err) {
            console.warn(`[ean-ai] Anthropic error:`, err);
        }
    }

    if (!answer) {
        console.warn(`[ean-ai] All providers failed — refusing match (safe-fail)`);
        return false;
    }

    const isMatch = answer.startsWith("oui");
    if (process.env.NODE_ENV === "development") {
        const verdict = isMatch ? "Accepted" : "Rejected";
        console.log(`[ean-ai] ${verdict}: "${productDesc}" vs "${candidateName}" — AI said: ${answer}`);
    }
    return isMatch;
}

/** Pick the best candidate above threshold from a list, with AI verification for uncertain matches */
export async function pickBestCandidate(
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

    // Try candidates in score order. AI verify ALWAYS — name-similarity scoring is
    // too easily fooled by short or generic names (e.g. "Casque audio Bose" matches
    // "Bose QuietComfort 45" at 0.87, "tshirt noir" matches "Oui Tshirt noir"
    // at 0.89). The semantic check by Claude Haiku is the only reliable guard.
    for (const best of scored) {
        if (best.score < REVERSE_SEARCH_THRESHOLD) break;

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

export async function fetchFromEanSearch(ean: string): Promise<EanResult | null> {
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

    const query = buildExternalSearchQuery(productName, brand);
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
        console.log(`[ean-search] "${query}" → ${items.length} results, best score: ${bestScore.toFixed(3)}, accepted: ${!!result}`);
    }
    return result;
}

// ── UPCitemdb (SECONDARY — US-centric, free tier) ──

export async function fetchFromUpcDatabase(ean: string): Promise<EanResult | null> {
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
 * Reverse search via local cache (ean_lookups + pg_trgm RPC search_ean_lookups_by_name).
 * Free and instant — consulted BEFORE the cascade of 4 external sources.
 * Returns the best candidate if score >= REVERSE_SEARCH_THRESHOLD, else null.
 */
async function searchEanByNameCache(
    productName: string,
    brand?: string | null,
): Promise<{ ean: string; brand: string | null; category: string | null } | null> {
    const normalized = normalizeForCache(brand ? `${brand} ${productName}` : productName);
    if (!normalized) return null;

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase.rpc("search_ean_lookups_by_name", {
        p_normalized_query: normalized,
        p_brand_filter: brand ?? null,
        p_limit: 5,
    });

    if (error || !rows || rows.length === 0) {
        logCacheMiss(productName, "cache_reverse");
        return null;
    }

    const candidates: ReverseSearchCandidate[] = (rows as Array<{
        ean: string; name: string; brand: string | null; category: string | null;
    }>).map(r => ({
        ean: r.ean,
        name: r.name,
        brand: r.brand,
        category: r.category,
        score: 0,
    }));

    const result = await pickBestCandidate(candidates, productName, brand);
    if (result) {
        void logCacheHit(result.ean);
        if (process.env.NODE_ENV === "development") {
            console.log(`[cache:reverse] hit "${productName}" → ${result.ean}`);
        }
    } else {
        logCacheMiss(productName, "cache_reverse_below_threshold");
    }
    return result;
}

/**
 * Reverse search via UPCitemdb: find EAN from product name.
 * Cascade: local cache → EAN-Search → UPCitemdb → Open Beauty Facts → Open Products Facts.
 */
export async function searchEanByName(
    productName: string,
    brand?: string | null,
): Promise<{ ean: string; brand: string | null; category: string | null } | null> {
    // Garde-fou anti-faux-positif : noms trop génériques produisent des matches
    // sémantiquement faux mais à score haut (ex "Produit 1" matche un placeholder NL).
    if (!isNameRichEnoughForReverseSearch(productName, brand)) {
        if (process.env.NODE_ENV === "development") {
            console.log(`[searchEanByName] SKIPPED "${productName}" — name too generic`);
        }
        return null;
    }

    // 0. Local cache (free, instant) — pg_trgm fuzzy match on previously enriched products
    const cacheReverseResult = await searchEanByNameCache(productName, brand);
    if (cacheReverseResult) return cacheReverseResult;

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
    const query = buildExternalSearchQuery(productName, brand);
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

export async function fetchFromOpenBeautyFacts(ean: string): Promise<EanResult | null> {
    const res = await fetchWithRetry(
        `https://world.openbeautyfacts.org/api/v2/product/${ean}.json`,
        {},
    );
    if (!res) return null;

    // Un 200 avec un corps non-JSON (page de maintenance / captcha) ferait throw res.json() →
    // dans le chemin séquentiel fetchEanData→lookupEan ça remonterait ; on dégrade en null (la
    // source disparaît proprement, comme un produit non trouvé). (revue SF-hunter)
    let data;
    try {
        data = await res.json();
    } catch {
        return null;
    }
    if (!data?.product || data.status === 0) return null;

    const product = data.product;
    return {
        name: product.product_name ?? "Unknown",
        brand: product.brands ?? null,
        // GTIN-keyée → fiable par construction (maillon 9). Voir open-facts-image.ts.
        photo_url: extractOpenFactsImage(product),
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
    const query = buildExternalSearchQuery(productName, brand);
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

export async function fetchFromOpenProductsFacts(ean: string): Promise<EanResult | null> {
    const res = await fetchWithRetry(
        `https://world.openproductsfacts.org/api/v2/product/${ean}.json`,
        {},
    );
    if (!res) return null;

    // Cf. fetchFromOpenBeautyFacts : 200 non-JSON → res.json() throw → dégrade en null. (revue SF-hunter)
    let data;
    try {
        data = await res.json();
    } catch {
        return null;
    }
    if (!data?.product || data.status === 0) return null;

    const product = data.product;
    return {
        name: product.product_name ?? "Unknown",
        brand: product.brands ?? null,
        // GTIN-keyée → fiable par construction (maillon 9). Voir open-facts-image.ts.
        photo_url: extractOpenFactsImage(product),
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
    const query = buildExternalSearchQuery(productName, brand);
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

        // Marqueur négatif : « déjà cherché partout, introuvable ». Frais → on
        // répond null SANS re-payer les 4 sources externes ; périmé → on retombe
        // dans la cascade ci-dessous (re-tentative légitime, les bases évoluent).
        if (cached && isNotFoundMarker(cached)) {
            if (isFreshNotFound(cached)) return null;
        } else if (cached) {
            return {
                name: cached.name ?? "Unknown",
                brand: cached.brand ?? null,
                // Prefer R2-rehosted photo for durability (falls back to original Serper/EAN-Search URL)
                photo_url: cached.photo_url_r2 ?? cached.photo_url ?? null,
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
        // Populate normalized name so the pg_trgm index can serve future reverse-search queries.
        // Must match the SQL backfill in migration 080.
        canonical_name_normalized: result.name ? normalizeForCache(result.name) : null,
        brand: result.brand,
        photo_url: result.photo_url,
        category: result.category,
        source: result.source,
        fetched_at: new Date().toISOString(),
    });

    // Re-host photo on R2 for durability (fire-and-forget, updates ean_lookups.photo_url_r2)
    if (result.photo_url) {
        void uploadPhotoToR2({ ean, sourceUrl: result.photo_url });
    }
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

    if (cached && isNotFoundMarker(cached)) {
        if (isFreshNotFound(cached)) {
            // Cache NÉGATIF frais : EAN déjà cherché sur toutes les sources récemment,
            // introuvable. On ne re-paye RIEN (ni les 4 lookups, ni Serper, ni vision).
            // Le hit négatif compte comme hit cache (il économise exactement ces appels).
            void logCacheHit(ean);
            return false;
        }
        // Marqueur périmé (> TTL) → re-tentative complète ci-dessous.
    } else if (cached) {
        // Cache hit: bump telemetry (fire-and-forget) then apply enrichment.
        // Prefer R2-rehosted photo over original Serper/EAN-Search URL.
        void logCacheHit(ean);
        const enriched = {
            ...cached,
            photo_url: cached.photo_url_r2 ?? cached.photo_url,
        };
        await applyEnrichment(supabase, productId, enriched, ean);
        return true;
    }

    // Cache miss: log for observability, then cascade through external sources
    logCacheMiss(ean, "cache");

    // Cascade through all sources (skip cache — already checked above)
    const result = await fetchEanData(ean, true);

    if (result) {
        await applyEnrichment(supabase, productId, result, ean);
        return true;
    }

    // Introuvable partout → poser/rafraîchir le marqueur négatif AVANT la tentative
    // Serper : si applyEnrichment lève après coup, le marqueur est déjà là et le
    // prochain run ne re-brûle pas la cascade (spend-safe même sur crash).
    await writeNotFoundMarker(supabase, ean);

    // No source found anything — still try Serper for the photo (UNE tentative par
    // fenêtre TTL, plus « à chaque run » : les runs suivants sortent au guard négatif).
    await applyEnrichment(supabase, productId, { name: null, brand: null, photo_url: null, category: null }, ean);
    return false;
}

/**
 * Écrit le marqueur négatif `source='not_found'` pour un EAN (upsert sur PK ean).
 * `name=''` (colonne NOT NULL) et `canonical_name_normalized=null` → jamais servi
 * comme donnée produit, jamais matché par la recherche fuzzy (083 filtre IS NOT NULL).
 * Les colonnes taxonomie (category_id…) ne sont PAS dans le payload → préservées si
 * un marqueur périmé est rafraîchi. Échec d'écriture = la fuite de coût persiste en
 * silence pour cet EAN → captureError (sans lever : le lookup lui-même a fini).
 */
async function writeNotFoundMarker(
    supabase: ReturnType<typeof createAdminClient>,
    ean: string,
): Promise<void> {
    const { error } = await supabase.from("ean_lookups").upsert({
        ean,
        name: "",
        canonical_name_normalized: null,
        brand: null,
        photo_url: null,
        category: null,
        source: EAN_NOT_FOUND_SOURCE,
        fetched_at: new Date().toISOString(),
    });
    if (error) {
        captureError(error, { module: "ean-lookup", phase: "write-not-found-marker", ean });
    }
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

    // Brand recovery (maillon 9 (c)): EAN-Search — the primary EAN source — never returns a
    // brand, so most products kept brand=null even though the authoritative resolved name
    // carries it. Recover a RECOGNISED brand (allow-list only → never invents) from the
    // resolved name first (keyed by the scanned barcode), then the merchant name. Fills only
    // when the source gave none, and never touches category (it has its own source above).
    if (!data.brand) {
        const recovered = extractKnownBrand(data.name) ?? extractKnownBrand(prod?.name);
        if (recovered) data.brand = recovered;
    }

    if (data.brand) updateData.brand = data.brand;
    // Category (maillon 9 (d)): EAN sources return their category in their OWN English taxonomy
    // ("clothing and fashion", "toys", "home and garden"). Translate it to a French L1 slug via
    // the allow-list — unrecognised/ambiguous → null (don't write; the AI path fills it). Only set
    // it if the AI categoriser hasn't already (it is authoritative; this EAN value is a fallback).
    const mappedCategory = mapEanCategoryToFr(data.category);
    if (mappedCategory && prod && !prod.category_id) updateData.category = mappedCategory;
    if (data.name && data.name !== "Unknown") updateData.canonical_name = data.name;

    // Photo: prefer the EAN-source image when present. An Open Facts image is GTIN-keyée (liée
    // au code-barres exact) → fiable et n'a pas besoin de la vérif texte→image que Serper exige
    // (maillon 9). Serper (recherche par nom) reste le REPLI quand la source n'a pas d'image.
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
