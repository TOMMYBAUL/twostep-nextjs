import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter } from "@/lib/pos";
import { captureError } from "@/lib/error";
import { decrypt } from "@/lib/email/encryption";
import { extractSize } from "@/lib/pos/extract-size";
import { createImageJob } from "@/lib/images/jobs";

export async function POST(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();
    const adapter = getAdapter("sumup");

    // Find all SumUp-connected merchants
    const { data: connections } = await supabase
        .from("pos_connections")
        .select("merchant_id, access_token, refresh_token, token_expires_at, options")
        .eq("provider", "sumup");

    if (!connections || connections.length === 0) {
        return NextResponse.json({ synced: 0, message: "No SumUp merchants" });
    }

    let synced = 0;
    let errors = 0;

    for (const conn of connections) {
        try {
            // Decrypt token
            let accessToken = decrypt(conn.access_token);

            // Refresh if expired
            if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
                const refreshToken = decrypt(conn.refresh_token);
                const newTokens = await adapter.refreshToken(refreshToken);
                if (newTokens) {
                    accessToken = newTokens.access_token;
                    // Update stored tokens
                    const { encrypt: enc } = await import("@/lib/email/encryption");
                    await supabase
                        .from("pos_connections")
                        .update({
                            access_token: enc(newTokens.access_token),
                            refresh_token: enc(newTokens.refresh_token),
                            token_expires_at: newTokens.expires_at,
                        })
                        .eq("merchant_id", conn.merchant_id)
                        .eq("provider", "sumup");
                }
            }

            // Fetch catalog + stock
            const catalog = await adapter.getCatalog(accessToken);
            const itemIds = catalog.map((p) => p.pos_item_id);
            const stockUpdates = await adapter.getStock(accessToken, itemIds);

            // Upsert products
            for (const product of catalog) {
                const size = extractSize(product.name);
                const { data: existing } = await supabase
                    .from("products")
                    .select("id")
                    .eq("merchant_id", conn.merchant_id)
                    .eq("pos_item_id", product.pos_item_id)
                    .maybeSingle();

                if (existing) {
                    await supabase
                        .from("products")
                        .update({
                            name: product.name,
                            price: product.price,
                            category: product.category?.toLowerCase() ?? null,
                            photo_url: product.photo_url,
                        })
                        .eq("id", existing.id);
                } else {
                    const { data: created } = await supabase
                        .from("products")
                        .insert({
                            merchant_id: conn.merchant_id,
                            name: product.name,
                            price: product.price,
                            ean: product.ean,
                            category: product.category?.toLowerCase() ?? null,
                            photo_url: product.photo_url,
                            size: size,
                            pos_item_id: product.pos_item_id,
                            pos_provider: "sumup",
                        })
                        .select("id")
                        .single();

                    if (created && product.photo_url) {
                        await createImageJob(created.id, conn.merchant_id, product.photo_url);
                    }
                }
            }

            // Update stock
            for (const update of stockUpdates) {
                const { data: product } = await supabase
                    .from("products")
                    .select("id")
                    .eq("merchant_id", conn.merchant_id)
                    .eq("pos_item_id", update.pos_item_id)
                    .maybeSingle();

                if (product) {
                    await supabase
                        .from("stock")
                        .upsert({ product_id: product.id, quantity: Math.max(0, update.quantity) });
                }
            }

            synced++;
        } catch (err) {
            errors++;
            captureError(err, { merchant: conn.merchant_id, cron: "sync-sumup" });
        }
    }

    return NextResponse.json({ synced, errors, total: connections.length });
}
