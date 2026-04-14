import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAccessToken, googleMerchantFetch } from "@/lib/google/merchant";
import { captureError } from "@/lib/error";

/**
 * Push inventory updates to Google for a merchant.
 * Best-effort: never throws, always returns silently.
 * Called after POS sync and webhooks.
 */
export async function pushInventoryToGoogle(
    merchantId: string,
    productIds?: string[],
): Promise<void> {
    try {
        const auth = await getGoogleAccessToken(merchantId);
        if (!auth) return;

        const supabase = createAdminClient();

        let query = supabase
            .from("products")
            .select("id, ean, stock(quantity)")
            .eq("merchant_id", merchantId)
            .eq("visible", true)
            .not("ean", "is", null);

        if (productIds && productIds.length > 0) {
            query = query.in("id", productIds);
        }

        const { data: products } = await query;
        if (!products || products.length === 0) return;

        const { connection, accessToken } = auth;
        const parent = `accounts/${connection.google_merchant_id}`;

        for (const product of products) {
            const s = (product as any).stock;
            const quantity = !s ? 0 : Array.isArray(s) ? (s[0]?.quantity ?? 0) : (s.quantity ?? 0);
            try {
                await googleMerchantFetch(
                    `/inventories/v1beta/${parent}/localInventories:insert`,
                    accessToken,
                    {
                        method: "POST",
                        body: JSON.stringify({
                            storeCode: connection.store_code,
                            productId: product.id,
                            availability: quantity > 0 ? "in_stock" : "out_of_stock",
                            quantity: quantity.toString(),
                        }),
                    },
                );
            } catch (err) {
                captureError(err, {
                    merchantId,
                    productId: product.id,
                    context: "google-inventory-push",
                });
            }
        }
    } catch (err) {
        captureError(err, { merchantId, context: "google-inventory-push-top" });
    }
}
