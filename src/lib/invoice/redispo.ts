import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/error";

/**
 * Mark the products as "recently re-approvisionnés" after an invoice is
 * activated. The badge "Revenue en stock" reads last_redispo_at < 24h to
 * surface freshly-restocked items to consumers and in Mon stock.
 *
 * Non-throwing: any failure is logged but does not block the caller — the
 * badge is a UX nicety, not a source of truth.
 */
export async function markProductsRedispo(productIds: string[]): Promise<void> {
    if (productIds.length === 0) return;
    try {
        const supabase = createAdminClient();
        const { error } = await supabase
            .from("products")
            .update({ last_redispo_at: new Date().toISOString() })
            .in("id", productIds);
        if (error) throw error;
    } catch (err) {
        captureError(err, { context: "markProductsRedispo", productIds });
    }
}
