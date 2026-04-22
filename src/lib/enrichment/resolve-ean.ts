import { createAdminClient } from "@/lib/supabase/admin";
import { lookupEan, searchEanByName } from "@/lib/ean/lookup";
import { searchProductImage } from "@/lib/images/serper";
import { createImageJob } from "@/lib/images/jobs";

/**
 * Outcome of a single resolveAndEnrich call.
 * `source` reports which branch of the cascade actually resolved the product.
 */
export type ResolveAndEnrichResult = {
    productId: string;
    ean: string | null;
    source:
        | "direct_ean"          // EAN was provided → lookupEan ran the full cascade
        | "sku_match"           // No EAN, but another product in DB shares the SKU + has an EAN
        | "reverse_search"      // No EAN/SKU match, but searchEanByName found a candidate
        | "serper_photo_only"   // No EAN found anywhere; only fallback photo from Serper
        | "none";               // Nothing applied
};

/**
 * Unified enrichment orchestrator. Used by:
 *  - invoice validation (validate/route.ts)
 *  - POS sync bootstrap (Task 10 — sync-engine.ts)
 *  - future scan/CSV ingestors
 *
 * Cascade:
 *  1. EAN provided → lookupEan (cache → 4 external sources → Serper photo + applyEnrichment)
 *  2. No EAN but SKU → reuse the EAN of any product that shares the SKU
 *  3. Reverse search by name+brand → searchEanByName (cache via Task 4 → 4 external sources)
 *  4. Last resort: Serper photo by name+brand+SKU + queue image job
 *
 * The function never throws — a single failed product must not break a loop of imports.
 */
export async function resolveAndEnrich(params: {
    productId: string;
    ean?: string | null;
    sku?: string | null;
    name?: string | null;
    brand?: string | null;
    merchantId: string;
}): Promise<ResolveAndEnrichResult> {
    const { productId, ean, sku, merchantId } = params;
    const supabase = createAdminClient();

    try {
        // 1. EAN provided → run the full enrichment cascade directly
        if (ean) {
            await lookupEan(ean, productId);
            return { productId, ean, source: "direct_ean" };
        }

        // Reverse strategies need name/brand — fetch from DB if not provided
        let name = params.name ?? null;
        let brand = params.brand ?? null;
        if (!name) {
            const { data: prod } = await supabase
                .from("products")
                .select("name, brand")
                .eq("id", productId)
                .single();
            if (!prod) return { productId, ean: null, source: "none" };
            name = prod.name;
            brand = brand ?? prod.brand;
        }

        let foundEan: string | null = null;
        let resolvedFrom: ResolveAndEnrichResult["source"] = "none";

        // 2. SKU match in the local product table
        if (sku) {
            const { data: skuMatch } = await supabase
                .from("products")
                .select("ean")
                .eq("sku", sku)
                .not("ean", "is", null)
                .neq("id", productId)
                .limit(1)
                .single();
            if (skuMatch?.ean) {
                foundEan = skuMatch.ean;
                resolvedFrom = "sku_match";
            }
        }

        // 3. Reverse search by name (cache → external)
        if (!foundEan && name) {
            const reverse = await searchEanByName(name, brand);
            if (reverse) {
                foundEan = reverse.ean;
                resolvedFrom = "reverse_search";
                // Save brand/category from reverse search immediately
                const updates: Record<string, unknown> = { ean: reverse.ean };
                if (reverse.brand) updates.brand = reverse.brand;
                if (reverse.category) updates.category = reverse.category;
                await supabase.from("products").update(updates).eq("id", productId);
            }
        }

        if (foundEan) {
            await supabase.from("products").update({ ean: foundEan }).eq("id", productId);
            await lookupEan(foundEan, productId);
            return { productId, ean: foundEan, source: resolvedFrom };
        }

        // 4. Last resort: Serper photo by name+brand+SKU
        if (name) {
            const photoUrl = await searchProductImage(name, brand, null, sku ?? null);
            if (photoUrl) {
                await supabase
                    .from("products")
                    .update({ photo_url: photoUrl, photo_processed_url: null, photo_source: "serper" })
                    .eq("id", productId);
                await createImageJob(productId, merchantId, photoUrl);
                return { productId, ean: null, source: "serper_photo_only" };
            }
        }

        return { productId, ean: null, source: "none" };
    } catch (err) {
        console.error("[resolve-ean] failed for", productId, ":", err);
        return { productId, ean: null, source: "none" };
    }
}
