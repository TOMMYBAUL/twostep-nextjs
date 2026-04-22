import { createAdminClient } from "@/lib/supabase/admin";
import { levenshtein } from "@/lib/ean/lookup";

/**
 * Existing product row used by the matching index.
 * `name` and other fields are optional to keep the index light when not all
 * matching strategies are needed (e.g. POS sync only wants pos_item_id + ean).
 */
export type ExistingProduct = {
    id: string;
    pos_item_id: string | null;
    ean: string | null;
    sku: string | null;
    name: string | null;
    photo_url?: string | null;
    photo_processed_url?: string | null;
};

export type ProductIndex = {
    byPosItemId: Map<string, ExistingProduct>;
    byEan: Map<string, ExistingProduct>;
    bySku: Map<string, ExistingProduct>;
    byName: Map<string, ExistingProduct>; // normalized
    all: ExistingProduct[];
};

export type MatchType =
    | "pos_item_id"
    | "exact_ean"
    | "exact_sku"
    | "exact_name"
    | "fuzzy";

export type MatchResult = {
    productId: string;
    product: ExistingProduct;
    matchType: MatchType;
};

export type Candidate = {
    posItemId?: string | null;
    ean?: string | null;
    sku?: string | null;
    name?: string | null;
};

const FUZZY_THRESHOLD_DEFAULT = 0.7;

function normalize(s: string): string {
    return s.toLowerCase().replace(/[''`\-/().,"]/g, " ").replace(/\s+/g, " ").trim();
}

function similarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Build an in-memory index of existing products for fast O(1) matching.
 * Single SELECT per merchant — caller then runs `matchProduct` in a loop.
 *
 * Default columns cover all four matching strategies. Pass a smaller `fields`
 * string for sync engines that only need pos_item_id + ean.
 */
export async function buildProductIndex(
    merchantId: string,
    fields = "id, pos_item_id, ean, sku, name, photo_url, photo_processed_url",
): Promise<ProductIndex> {
    const supabase = createAdminClient();
    const { data: rows } = await supabase
        .from("products")
        .select(fields)
        .eq("merchant_id", merchantId);

    const all = (rows ?? []) as unknown as ExistingProduct[];
    const byPosItemId = new Map<string, ExistingProduct>();
    const byEan = new Map<string, ExistingProduct>();
    const bySku = new Map<string, ExistingProduct>();
    const byName = new Map<string, ExistingProduct>();

    for (const p of all) {
        if (p.pos_item_id) byPosItemId.set(p.pos_item_id, p);
        if (p.ean) byEan.set(p.ean, p);
        if (p.sku) bySku.set(p.sku, p);
        if (p.name) byName.set(normalize(p.name), p);
    }

    return { byPosItemId, byEan, bySku, byName, all };
}

/**
 * Match a candidate against the index by descending priority:
 *   pos_item_id > exact_ean > exact_sku > exact_name > fuzzy
 *
 * Returns null if no match passes the configured threshold (caller decides
 * to create a new product).
 *
 * Set `allowFuzzy: false` for high-confidence callers (POS sync) where a
 * fuzzy name match would be too risky.
 */
export function matchProduct(
    candidate: Candidate,
    index: ProductIndex,
    options?: { fuzzyThreshold?: number; allowFuzzy?: boolean },
): MatchResult | null {
    if (candidate.posItemId) {
        const m = index.byPosItemId.get(candidate.posItemId);
        if (m) return { productId: m.id, product: m, matchType: "pos_item_id" };
    }

    if (candidate.ean) {
        const m = index.byEan.get(candidate.ean);
        if (m) return { productId: m.id, product: m, matchType: "exact_ean" };
    }

    if (candidate.sku) {
        const m = index.bySku.get(candidate.sku);
        if (m) return { productId: m.id, product: m, matchType: "exact_sku" };
    }

    if (candidate.name) {
        const normalized = normalize(candidate.name);
        const exact = index.byName.get(normalized);
        if (exact) return { productId: exact.id, product: exact, matchType: "exact_name" };

        if (options?.allowFuzzy !== false && index.all.length > 0) {
            const threshold = options?.fuzzyThreshold ?? FUZZY_THRESHOLD_DEFAULT;
            let bestId: string | null = null;
            let bestProduct: ExistingProduct | null = null;
            let bestScore = 0;

            for (const product of index.all) {
                if (!product.name) continue;
                const normalizedProduct = normalize(product.name);

                // Containment heuristic
                if (
                    normalized.includes(normalizedProduct) ||
                    normalizedProduct.includes(normalized)
                ) {
                    const score = Math.min(normalized.length, normalizedProduct.length) /
                        Math.max(normalized.length, normalizedProduct.length);
                    if (score > bestScore) {
                        bestScore = score;
                        bestId = product.id;
                        bestProduct = product;
                    }
                    continue;
                }

                // Levenshtein similarity
                const score = similarity(normalized, normalizedProduct);
                if (score > bestScore) {
                    bestScore = score;
                    bestId = product.id;
                    bestProduct = product;
                }
            }

            if (bestId && bestProduct && bestScore >= threshold) {
                return { productId: bestId, product: bestProduct, matchType: "fuzzy" };
            }
        }
    }

    return null;
}
