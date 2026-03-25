import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lightspeedAdapter } from "@/lib/pos/lightspeed";
import { captureError } from "@/lib/error";
import { notifyProductFavorites } from "@/lib/push-send";

export async function POST(request: NextRequest) {
    const body = await request.text();
    const signature = request.headers.get("x-lightspeed-signature") ?? "";

    if (!lightspeedAdapter.verifyWebhook(body, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let event: Record<string, unknown>;
    try {
        event = JSON.parse(body);
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const updates = lightspeedAdapter.parseWebhookEvent(event);
    if (!updates || updates.length === 0) {
        // Acknowledge unhandled event types
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

            // Lightspeed sends relative decrements — fetch current stock then apply delta
            const { data: currentStock } = await supabase
                .from("stock")
                .select("quantity")
                .eq("product_id", product.id)
                .single();

            const currentQty = currentStock?.quantity ?? 0;
            const newQty = Math.max(0, currentQty + update.quantity);

            await supabase.from("stock").upsert({
                product_id: product.id,
                quantity: newQty,
            });

            await supabase.from("feed_events").insert({
                merchant_id: product.merchant_id,
                product_id: product.id,
                event_type: "sale",
            });

            // Notify favorites when product restocked (quantity went up)
            if (update.quantity > 0 && newQty > 0 && currentQty === 0) {
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
        captureError(e, { route: "webhooks/lightspeed" });
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
}
