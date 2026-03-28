import { NextResponse } from "next/server";

import { zettleAdapter } from "@/lib/pos/zettle";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/error";
import { notifyProductFavorites } from "@/lib/push-send";

export async function POST(request: Request) {
    const body = await request.text();
    const signature = request.headers.get("x-izettle-signature") || "";

    if (!zettleAdapter.verifyWebhook(body, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    let event: Record<string, unknown>;
    try {
        event = JSON.parse(body);
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const updates = zettleAdapter.parseWebhookEvent(event);
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

            const { data: currentStock } = await supabase
                .from("stock")
                .select("quantity")
                .eq("product_id", product.id)
                .single();

            const previousQty = currentStock?.quantity ?? 0;

            await supabase.from("stock").upsert({
                product_id: product.id,
                quantity: Math.max(0, update.quantity),
            });

            await supabase.from("feed_events").insert({
                merchant_id: product.merchant_id,
                product_id: product.id,
                event_type: update.quantity > previousQty ? "restock" : "sale",
            });

            // Notify favorites when product comes back in stock
            if (update.quantity > 0 && previousQty === 0) {
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

        return NextResponse.json({ ok: true });
    } catch (e) {
        captureError(e, { route: "webhooks/zettle" });
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
}
