import { NextResponse } from "next/server";

import { squareAdapter } from "@/lib/pos/square";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/error";
import { notifyProductFavorites } from "@/lib/push-send";
import { recalculateGroupSizesAdmin } from "@/lib/pos/recalculate-sizes";
import { pushInventoryToGoogle } from "@/lib/google/inventory";

export async function POST(request: Request) {
    const body = await request.text();
    const signature = request.headers.get("x-square-hmacsha256-signature") || "";

    // Verify webhook signature
    if (!squareAdapter.verifyWebhook(body, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    let event: Record<string, unknown>;
    try {
        event = JSON.parse(body);
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const updates = squareAdapter.parseWebhookEvent(event);
    if (!updates || updates.length === 0) {
        // Acknowledge unhandled event types
        return NextResponse.json({ ok: true });
    }

    try {
        // Webhooks bypass RLS — use admin client
        const supabase = createAdminClient();

        for (const update of updates) {
            // Find product by pos_item_id
            const { data: product } = await supabase
                .from("products")
                .select("id, merchant_id")
                .eq("pos_item_id", update.pos_item_id)
                .single();

            if (!product) continue;

            // Atomic stock update
            await supabase.from("stock").upsert({
                product_id: product.id,
                quantity: Math.max(0, update.quantity),
            });

            // Recalculate available_sizes on the group principal
            await recalculateGroupSizesAdmin(product.id);

            // Emit restock feed_event
            await supabase.from("feed_events").insert({
                merchant_id: product.merchant_id,
                product_id: product.id,
                event_type: "restock",
            });

            // Push notification to users who favorited this product
            if (update.quantity > 0) {
                const { data: productInfo } = await supabase
                    .from("products")
                    .select("name")
                    .eq("id", product.id)
                    .single();
                notifyProductFavorites(product.id, {
                    title: "De retour en stock !",
                    body: `${productInfo?.name ?? "Un produit"} est à nouveau disponible`,
                    url: `/product/${product.id}`,
                }).catch(() => {});
            }
        }

        // Push updated inventory to Google
        if (updates.length > 0) {
            const { data: firstProduct } = await supabase
                .from("products")
                .select("merchant_id")
                .eq("pos_item_id", updates[0].pos_item_id)
                .maybeSingle();
            if (firstProduct) {
                pushInventoryToGoogle(firstProduct.merchant_id).catch(() => {});
            }
        }

        return NextResponse.json({ ok: true });
    } catch (e) {
        captureError(e, { route: "webhooks/square" });
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
}
