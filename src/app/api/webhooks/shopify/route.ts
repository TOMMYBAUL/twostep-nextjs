import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyAdapter } from "@/lib/pos/shopify";
import { captureError } from "@/lib/error";
import { notifyProductFavorites } from "@/lib/push-send";
import { recalculateGroupSizesAdmin } from "@/lib/pos/recalculate-sizes";
import { pushInventoryToGoogle } from "@/lib/google/inventory";
import { updateStockAtomic } from "@/lib/pos/update-stock";
import { resolveWebhookProduct } from "@/lib/pos/resolve-product";

export async function POST(request: NextRequest) {
    const body = await request.text();
    const signature = request.headers.get("x-shopify-hmac-sha256") ?? "";

    if (!shopifyAdapter.verifyWebhook(body, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Idempotence: reject duplicate webhook deliveries
    const webhookId = request.headers.get("x-shopify-webhook-id");
    if (webhookId) {
        const supabaseCheck = createAdminClient();
        // Mode DELTA : un échec de lecture/écriture de l'idempotence NE DOIT PAS être avalé.
        // Si la lecture échoue, `existing` serait null → le webhook serait re-traité (double
        // décrément de la vente). On LÈVE le signal via 500 (le POS retente) plutôt que de
        // risquer un double-comptage silencieux.
        const { data: existing, error: checkErr } = await supabaseCheck
            .from("webhook_events")
            .select("id")
            .eq("webhook_id", webhookId)
            .maybeSingle();
        if (checkErr) {
            captureError(checkErr, { route: "webhooks/shopify", phase: "idempotence-check", webhookId });
            return NextResponse.json({ error: "Idempotence check failed" }, { status: 500 });
        }
        if (existing) {
            return NextResponse.json({ ok: true, skipped: "duplicate" });
        }
        const { error: insertErr } = await supabaseCheck.from("webhook_events").insert({ webhook_id: webhookId, provider: "shopify" });
        if (insertErr) {
            captureError(insertErr, { route: "webhooks/shopify", phase: "idempotence-insert", webhookId });
            return NextResponse.json({ error: "Idempotence insert failed" }, { status: 500 });
        }
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

        // Produits RÉELLEMENT touchés par l'événement — pour le push Google CIBLÉ (A1).
        const touched: Array<{ id: string; merchant_id: string }> = [];

        for (const update of updates) {
            const product = await resolveWebhookProduct(supabase, update.pos_item_id, "shopify");
            if (!product) continue;
            touched.push(product);

            // Atomic delta stock update — eliminates TOCTOU race condition.
            // source_ts = horodatage de la vérité source (heure de l'événement) plutôt que
            // l'heure de réception serveur → confidence "vu il y a X" honnête.
            // `written` = le stock a RÉELLEMENT changé (P0-6). Un delta clampé à zéro (stock déjà
            // à 0) est un no-op → on n'émet ni « sale » fantôme ni notification.
            const { previous: previousQty, written } = await updateStockAtomic(supabase, product.id, update.quantity, "delta", "webhook", update.updated_at);
            const newQty = Math.max(0, previousQty + update.quantity);

            // Recalculate available_sizes on the group principal.
            // Le stock autoritaire est DÉJÀ committé par updateStockAtomic ci-dessus ; recalc
            // n'est qu'une métadonnée d'affichage dérivée (available_sizes/total). Si elle THROW
            // (réseau/RPC ≠ erreurs Supabase qu'elle capture déjà en interne), on NE laisse PAS
            // remonter au catch route : un 500 ferait retenter le POS → idempotence skip (webhook_id
            // déjà vu) → recalc jamais rejoué + risque de double-décrément delta. captureError + on
            // continue (re-convergence au resync). Cohérent avec feed/notify/google ci-dessous.
            try {
                await recalculateGroupSizesAdmin(product.id);
            } catch (e) {
                captureError(e, { route: "webhooks/shopify", phase: "recalc-sizes", productId: product.id });
            }

            // Negative delta = sale (stock consumed), positive = restock/return.
            // `written` gate : pas d'événement sur un delta no-op (stock déjà à 0), P0-6.
            if (written) {
                const eventType = update.quantity < 0 ? "sale" : "restock";
                const { error: feedErr } = await supabase.from("feed_events").insert({
                    merchant_id: product.merchant_id,
                    product_id: product.id,
                    event_type: eventType,
                });
                if (feedErr) captureError(feedErr, { route: "webhooks/shopify", phase: "feed-event", productId: product.id });
            }

            // Notify favorites when product restocked (quantity went up)
            if (written && update.quantity > 0 && newQty > 0 && previousQty === 0) {
                const { data: productInfo } = await supabase
                    .from("products")
                    .select("name")
                    .eq("id", product.id)
                    .single();
                notifyProductFavorites(product.id, {
                    title: "De retour en stock !",
                    body: `${productInfo?.name ?? "Un produit"} est à nouveau disponible`,
                    url: `/product/${product.id}`,
                }).catch((e) => captureError(e, { route: "webhooks/shopify", phase: "push-notify", productId: product.id }));
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
                    captureError(e, { route: "webhooks/shopify", phase: "google-inventory", merchantId }),
                );
            }
        }

        return NextResponse.json({ ok: true });
    } catch (e) {
        captureError(e, { route: "webhooks/shopify" });
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
}
