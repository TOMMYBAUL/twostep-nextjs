import { createAdminClient } from "@/lib/supabase/admin";
import { lookupEan } from "@/lib/ean/lookup";
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

    return { enriched, failed };
}
