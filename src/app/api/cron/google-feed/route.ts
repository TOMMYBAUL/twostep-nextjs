import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAccessToken, googleMerchantFetch } from "@/lib/google/merchant";
import { transformProductToGoogle, filterEligibleProducts } from "@/lib/google/feed";
import { captureError } from "@/lib/error";

export async function POST(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { data: connections } = await supabase
        .from("google_merchant_connections")
        .select("merchant_id, store_code");

    if (!connections || connections.length === 0) {
        return NextResponse.json({ processed: 0, message: "No Google-connected merchants" });
    }

    let totalPushed = 0;
    let errors = 0;

    for (const conn of connections) {
        try {
            const auth = await getGoogleAccessToken(conn.merchant_id);
            if (!auth) {
                errors++;
                continue;
            }

            const { data: products } = await supabase
                .from("products")
                .select("id, name, canonical_name, ean, price, photo_processed_url, photo_url, visible, stock(quantity)")
                .eq("merchant_id", conn.merchant_id);

            if (!products) continue;

            const eligible = filterEligibleProducts(products as any);
            const parent = `accounts/${auth.connection.google_merchant_id}`;

            let pushed = 0;
            for (const product of eligible) {
                try {
                    const googleProduct = transformProductToGoogle(product as any, conn.store_code);
                    await googleMerchantFetch(
                        `/products/v1beta/${parent}/productInputs:insert`,
                        auth.accessToken,
                        {
                            method: "POST",
                            body: JSON.stringify(googleProduct),
                        },
                    );
                    pushed++;
                } catch (err) {
                    captureError(err, {
                        merchantId: conn.merchant_id,
                        productId: product.id,
                        cron: "google-feed",
                    });
                }
            }

            await supabase
                .from("google_merchant_connections")
                .update({
                    products_pushed: pushed,
                    last_feed_at: new Date().toISOString(),
                    last_feed_status: "success",
                    last_feed_error: null,
                })
                .eq("merchant_id", conn.merchant_id);

            totalPushed += pushed;
        } catch (err) {
            errors++;
            captureError(err, { merchantId: conn.merchant_id, cron: "google-feed" });

            await supabase
                .from("google_merchant_connections")
                .update({
                    last_feed_status: "error",
                    last_feed_error: err instanceof Error ? err.message : String(err),
                })
                .eq("merchant_id", conn.merchant_id);
        }
    }

    return NextResponse.json({
        merchants: connections.length,
        products_pushed: totalPushed,
        errors,
    });
}

export { POST as GET };
