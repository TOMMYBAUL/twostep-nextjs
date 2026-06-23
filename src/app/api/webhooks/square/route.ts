import { NextResponse } from "next/server";

import { squareAdapter } from "@/lib/pos/square";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/error";
import { notifyProductFavorites } from "@/lib/push-send";
import { recalculateGroupSizesAdmin } from "@/lib/pos/recalculate-sizes";
import { pushInventoryToGoogle } from "@/lib/google/inventory";
import { updateStockAtomic } from "@/lib/pos/update-stock";
import { resolveWebhookProduct } from "@/lib/pos/resolve-product";

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
            const product = await resolveWebhookProduct(supabase, update.pos_item_id, "square");
            if (!product) continue;

            // Atomic stock update — eliminates TOCTOU race condition.
            // On transmet l'horodatage RÉEL de l'événement (calculated_at Square) comme
            // source_ts → active la garde anti-régression de la 104 : un webhook périmé
            // (livré dans le désordre / retry tardif) n'écrase plus une vérité plus fraîche.
            const previousQty = await updateStockAtomic(supabase, product.id, update.quantity, "absolute", "webhook", update.updated_at);

            // Recalculate available_sizes on the group principal.
            // Le stock absolu est déjà committé ; recalc = métadonnée d'affichage DÉRIVÉE → un
            // throw réseau (≠ erreurs Supabase qu'il capture en interne) ne doit PAS faire 500 :
            // ça transformerait un échec d'affichage en échec du canal stock + déclencherait un
            // retry POS inutile. captureError-et-continue (cohérent avec shopify/lightspeed).
            try {
                await recalculateGroupSizesAdmin(product.id);
            } catch (recalcErr) {
                captureError(recalcErr, { route: "webhooks/square", phase: "recalc-sizes", productId: product.id });
            }

            // Emit restock feed_event only when stock goes from 0 to positive
            if (previousQty === 0 && update.quantity > 0) {
                const { error: feedErr } = await supabase.from("feed_events").insert({
                    merchant_id: product.merchant_id,
                    product_id: product.id,
                    event_type: "restock",
                });
                if (feedErr) captureError(feedErr, { route: "webhooks/square", phase: "feed-event", productId: product.id });
            }

            // Push notification only when back in stock (was 0, now positive)
            if (previousQty === 0 && update.quantity > 0) {
                const { data: productInfo } = await supabase
                    .from("products")
                    .select("name")
                    .eq("id", product.id)
                    .single();
                notifyProductFavorites(product.id, {
                    title: "De retour en stock !",
                    body: `${productInfo?.name ?? "Un produit"} est à nouveau disponible`,
                    url: `/product/${product.id}`,
                }).catch((e) => captureError(e, { route: "webhooks/square", phase: "push-notify", productId: product.id }));
            }
        }

        // Push updated inventory to Google
        if (updates.length > 0) {
            const { data: firstProduct, error: merchantErr } = await supabase
                .from("products")
                .select("merchant_id")
                .eq("pos_item_id", updates[0].pos_item_id)
                .maybeSingle();
            if (merchantErr) captureError(merchantErr, { route: "webhooks/square", phase: "merchant-lookup-google" });
            if (firstProduct) {
                pushInventoryToGoogle(firstProduct.merchant_id).catch((e) =>
                    captureError(e, { route: "webhooks/square", phase: "google-inventory", merchantId: firstProduct.merchant_id }),
                );
            }
        }

        return NextResponse.json({ ok: true });
    } catch (e) {
        captureError(e, { route: "webhooks/square" });
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
}
