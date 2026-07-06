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

        // Produits RÉELLEMENT touchés par l'événement — pour le push Google CIBLÉ (A1).
        const touched: Array<{ id: string; merchant_id: string }> = [];

        for (const update of updates) {
            const product = await resolveWebhookProduct(supabase, update.pos_item_id, "square");
            if (!product) continue;
            touched.push(product);

            // Atomic stock update — eliminates TOCTOU race condition.
            // On transmet l'horodatage RÉEL de l'événement (calculated_at Square) comme
            // source_ts → active la garde anti-régression de la 104 : un webhook périmé
            // (livré dans le désordre / retry tardif) n'écrase plus une vérité plus fraîche.
            // `written` = le stock a RÉELLEMENT changé (P0-6). Un absolu périmé rejeté par la garde
            // temporelle 104 (webhook out-of-order : DB fraîche épuisée, événement périmé positif)
            // renverrait previousQty=0 → sans ce garde, on émettrait un « restock »/notif FANTÔME.
            const { previous: previousQty, written } = await updateStockAtomic(supabase, product.id, update.quantity, "absolute", "webhook", update.updated_at);

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

            // Emit restock feed_event only when stock goes from 0 to positive AND the write happened
            // (`written` : jamais sur un absolu périmé rejeté = restock fantôme, P0-6).
            if (written && previousQty === 0 && update.quantity > 0) {
                const { error: feedErr } = await supabase.from("feed_events").insert({
                    merchant_id: product.merchant_id,
                    product_id: product.id,
                    event_type: "restock",
                });
                if (feedErr) captureError(feedErr, { route: "webhooks/square", phase: "feed-event", productId: product.id });
            }

            // Push notification only when back in stock (was 0, now positive) AND the write happened
            if (written && previousQty === 0 && update.quantity > 0) {
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

        // Push CIBLÉ de l'inventaire Google (A1) : seuls les produits réellement touchés
        // par l'événement partent vers Google — plus jamais le catalogue entier à chaque
        // vente (gaspillage quota + latence). Le merchant_id vient de resolveWebhookProduct
        // (le re-lookup par pos_item_id est supprimé). Groupé par marchand par sûreté.
        // Aucun produit résolu = aucun stock modifié → rien à pousser.
        if (touched.length > 0) {
            const byMerchant = new Map<string, string[]>();
            for (const t of touched) {
                byMerchant.set(t.merchant_id, [...(byMerchant.get(t.merchant_id) ?? []), t.id]);
            }
            for (const [merchantId, productIds] of byMerchant) {
                pushInventoryToGoogle(merchantId, productIds).catch((e) =>
                    captureError(e, { route: "webhooks/square", phase: "google-inventory", merchantId }),
                );
            }
        }

        return NextResponse.json({ ok: true });
    } catch (e) {
        captureError(e, { route: "webhooks/square" });
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
}
