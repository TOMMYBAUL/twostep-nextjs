import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyAdapter } from "@/lib/pos/shopify";
import { captureError } from "@/lib/error";
import { notifyProductFavorites } from "@/lib/push-send";
import { recalculateGroupSizesAdmin } from "@/lib/pos/recalculate-sizes";
import { pushInventoryToGoogle } from "@/lib/google/inventory";
import { updateStockAtomic } from "@/lib/pos/update-stock";

export async function POST(request: NextRequest) {
    const body = await request.text();
    const signature = request.headers.get("x-shopify-hmac-sha256") ?? "";

    if (!shopifyAdapter.verifyWebhook(body, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let event: Record<string, unknown>;
    try {
        event = JSON.parse(body);
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const updates = shopifyAdapter.parseWebhookEvent(event);
    if (!updates || updates.length === 0) {
        return NextResponse.json({ ok: true });
    }

    try {
        const supabase = createAdminClient();

        for (const update of updates) {
            const { data: product } = await supabase
                .from("products")
                .select("id, merchant_id")
                .eq("pos_item_id", update.pos_item_id)
                .single();

            if (!product) continue;

            // Atomic delta stock update — eliminates TOCTOU race condition
            const previousQty = await updateStockAtomic(supabase, product.id, update.quantity, "delta");
            const newQty = Math.max(0, previousQty + update.quantity);

            // Recalculate available_sizes on the group principal
            await recalculateGroupSizesAdmin(product.id);

            // Negative delta = sale (stock consumed), positive = restock/return
            const eventType = update.quantity < 0 ? "sale" : "restock";
            await supabase.from("feed_events").insert({
                merchant_id: product.merchant_id,
                product_id: product.id,
                event_type: eventType,
            });

            // Notify favorites when product restocked (quantity went up)
            if (update.quantity > 0 && newQty > 0 && previousQty === 0) {
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
        captureError(e, { route: "webhooks/shopify" });
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
}
