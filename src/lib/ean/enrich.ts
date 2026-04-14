import { createAdminClient } from "@/lib/supabase/admin";
import { lookupEan } from "@/lib/ean/lookup";
import { searchProductImage } from "@/lib/images/serper";
import { createImageJob } from "@/lib/images/jobs";
import { captureError } from "@/lib/error";

type ProductToEnrich = { id: string; ean: string };

/**
 * Select products with EAN that haven't been enriched yet.
 */
export async function selectProductsToEnrich(
    merchantId?: string,
    limit?: number,
): Promise<ProductToEnrich[]> {
    const supabase = createAdminClient();

    let query = supabase
        .from("products")
        .select("id, ean")
        .not("ean", "is", null)
        .is("canonical_name", null);

    if (merchantId) {
        query = query.eq("merchant_id", merchantId);
    }

    query = query.order("created_at", { ascending: false });

    if (limit) {
        query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data.filter((p): p is ProductToEnrich => p.ean !== null);
}

/**
 * Enrich all non-enriched products for a merchant.
 * Called synchronously during POS sync.
 */
export async function enrichNewProducts(merchantId: string): Promise<{ enriched: number; failed: number }> {
    const products = await selectProductsToEnrich(merchantId);

    let enriched = 0;
    let failed = 0;

    for (const product of products) {
        try {
            const success = await lookupEan(product.ean, product.id);
            if (success) enriched++;
            else failed++;
        } catch (err) {
            failed++;
            captureError(err, { productId: product.id, ean: product.ean, context: "ean-enrich" });
        }
    }

    // Second pass: products WITHOUT EAN that still have no photo → Serper only
    await enrichProductsWithoutEan(merchantId);

    return { enriched, failed };
}

/**
 * Find photos via Serper for products that have no EAN and no photo.
 */
export async function enrichProductsWithoutEan(merchantId: string): Promise<void> {
    const supabase = createAdminClient();

    const { data: products } = await supabase
        .from("products")
        .select("id, name, brand, merchant_id")
        .eq("merchant_id", merchantId)
        .is("ean", null)
        .is("photo_url", null)
        .limit(50);

    if (!products || products.length === 0) return;

    for (const product of products) {
        try {
            const photoUrl = await searchProductImage(product.name, product.brand);
            if (photoUrl) {
                await supabase
                    .from("products")
                    .update({
                        photo_url: photoUrl,
                        photo_processed_url: null,
                        photo_source: "serper",
                    })
                    .eq("id", product.id);

                await createImageJob(product.id, product.merchant_id, photoUrl, supabase as any);
            }
        } catch (err) {
            captureError(err, { productId: product.id, context: "serper-enrich-no-ean" });
        }
    }
}
