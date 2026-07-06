import { NextResponse } from "next/server";

import { zettleAdapter } from "@/lib/pos/zettle";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/error";
import { notifyProductFavorites } from "@/lib/push-send";
import { recalculateGroupSizesAdmin } from "@/lib/pos/recalculate-sizes";
import { pushInventoryToGoogle } from "@/lib/google/inventory";
import { updateStockAtomic } from "@/lib/pos/update-stock";
import { resolveWebhookProduct } from "@/lib/pos/resolve-product";

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

        // Produits RÉELLEMENT touchés par l'événement — pour le push Google CIBLÉ (A1).
        const touched: Array<{ id: string; merchant_id: string }> = [];

        for (const update of updates) {
            const product = await resolveWebhookProduct(supabase, update.pos_item_id, "zettle");
            if (!product) continue;
            touched.push(product);

            // Atomic stock update — eliminates TOCTOU race condition.
            // source_ts = horodatage RÉEL de l'événement (timestamp Zettle) → active la
            // garde anti-régression de la 104 sur ce flux absolu (anti-dérive out-of-order).
            // `written` = le stock a RÉELLEMENT changé (ni rejet temporel de la garde 104 sur un
            // absolu périmé, ni no-op). On ne dérive feed_event/notification QUE si `written` :
            // sinon un webhook livré DANS LE DÉSORDRE (DB fraîche épuisée, événement périmé positif)
            // émettrait un « restock »/notif FANTÔME (P0-6). Le stock lui-même est déjà géré par la RPC.
            const { previous: previousQty, written } = await updateStockAtomic(supabase, product.id, update.quantity, "absolute", "webhook", update.updated_at);

            // Stock absolu déjà committé ; recalc = métadonnée d'affichage DÉRIVÉE → un throw
            // réseau ne doit PAS faire 500 (échec d'affichage ≠ échec du canal stock + retry POS
            // inutile). captureError-et-continue (cohérent avec shopify/lightspeed/square).
            try {
                await recalculateGroupSizesAdmin(product.id);
            } catch (recalcErr) {
                captureError(recalcErr, { route: "webhooks/zettle", phase: "recalc-sizes", productId: product.id });
            }

            if (written) {
                const { error: feedErr } = await supabase.from("feed_events").insert({
                    merchant_id: product.merchant_id,
                    product_id: product.id,
                    event_type: update.quantity > previousQty ? "restock" : "sale",
                });
                if (feedErr) captureError(feedErr, { route: "webhooks/zettle", phase: "feed-event", productId: product.id });
            }

            // Notify favorites when product comes back in stock
            if (written && update.quantity > 0 && previousQty === 0) {
                const { data: productInfo } = await supabase
                    .from("products")
                    .select("name")
                    .eq("id", product.id)
                    .single();
                notifyProductFavorites(product.id, {
                    title: "De retour en stock !",
                    body: `${productInfo?.name ?? "Un produit"} est à nouveau disponible`,
                    url: `/product/${product.id}`,
                }).catch((e) => captureError(e, { route: "webhooks/zettle", phase: "push-notify", productId: product.id }));
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
                    captureError(e, { route: "webhooks/zettle", phase: "google-inventory", merchantId }),
                );
            }
        }

        return NextResponse.json({ ok: true });
    } catch (e) {
        captureError(e, { route: "webhooks/zettle" });
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
}
