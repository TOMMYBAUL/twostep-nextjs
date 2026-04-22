import { createAdminClient } from "@/lib/supabase/admin";
import { logCacheHit, logCacheMiss } from "@/lib/enrichment/telemetry";

/**
 * Two-Step taxonomy cached on an EAN row in `ean_lookups`.
 *
 * Note: `category_id` and `subcategory_id` here store category SLUGS
 * (e.g. "chaussures", "sneakers-homme"), NOT UUIDs. Slugs are stable
 * across DB rebuilds; UUIDs are not. The caller is responsible for
 * resolving slug → UUID via the local categories tree.
 */
export type CachedTaxonomy = {
    category_id: string | null;
    subcategory_id: string | null;
    gender: string | null;
    color: string | null;
    tags: string[] | null;
};

/**
 * Read cached taxonomy for an EAN. Returns null if the row is missing
 * or has no `category_id` (i.e. never enriched with taxonomy yet).
 *
 * Telemetry: increments `hit_count` on hit, logs `cache_taxonomy` miss otherwise.
 */
export async function getCachedTaxonomy(ean: string): Promise<CachedTaxonomy | null> {
    if (!ean) return null;

    try {
        const supabase = createAdminClient();
        const { data: row } = await supabase
            .from("ean_lookups")
            .select("category_id, subcategory_id, gender, color, tags")
            .eq("ean", ean)
            .maybeSingle();

        if (!row || !row.category_id) {
            logCacheMiss(ean, "cache_taxonomy");
            return null;
        }

        void logCacheHit(ean);
        return {
            category_id: row.category_id ?? null,
            subcategory_id: row.subcategory_id ?? null,
            gender: row.gender ?? null,
            color: row.color ?? null,
            tags: row.tags ?? null,
        };
    } catch {
        return null;
    }
}

/**
 * Write taxonomy onto an existing EAN row. No-op if the row doesn't exist.
 * Best-effort: failures are silent (telemetry, not critical path).
 */
export async function cacheTaxonomy(
    ean: string,
    taxonomy: {
        category_id: string | null;
        subcategory_id: string | null;
        gender: string | null;
        color: string | null;
        tags: string[];
    },
): Promise<void> {
    if (!ean) return;

    try {
        const supabase = createAdminClient();
        await supabase
            .from("ean_lookups")
            .update({
                category_id: taxonomy.category_id,
                subcategory_id: taxonomy.subcategory_id,
                gender: taxonomy.gender,
                color: taxonomy.color,
                tags: taxonomy.tags,
            })
            .eq("ean", ean);
    } catch {
        // Best-effort: don't break categorization on cache write failure
    }
}
