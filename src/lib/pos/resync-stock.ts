import type { SupabaseClient } from "@supabase/supabase-js";
import type { POSStockUpdate } from "@/lib/pos/types";
import { getActivePosAccessToken } from "@/lib/pos/access-token";
import { captureError } from "@/lib/error";

/**
 * Re-sync STOCK-ONLY d'un marchand POS, en contexte service_role (cron).
 *
 * But : auto-guérir la dérive de stock. Shopify et Lightspeed pilotent leurs
 * webhooks par la VENTE (toujours décrément) → un retour/remboursement n'est
 * jamais ré-incrémenté → le stock dérive vers le bas indéfiniment (et la mode a
 * 10-30% de retours). En retirant périodiquement la quantité ABSOLUE du POS
 * (getStock), on remet le miroir à la vérité de la caisse, quels que soient les
 * webhooks ratés. Agnostique aux 4 adapters.
 *
 * Léger volontairement : pas de rebuild catalogue (≠ resync complet), juste les
 * quantités. Préserve les UUID produits et les FK.
 */

export type StockResyncResult = {
    merchant_id: string;
    ok: boolean;
    updated: number;
    fetched: number;
    reason?: string;
};

/** Pur (testable) : associe les quantités POS aux product_id par pos_item_id. */
export function mapStockUpdatesToProducts(
    products: { id: string; pos_item_id: string | null }[],
    stockUpdates: POSStockUpdate[],
): { productId: string; quantity: number }[] {
    const byPos = new Map<string, string>();
    for (const p of products) {
        if (p.pos_item_id) byPos.set(p.pos_item_id, p.id);
    }
    const out: { productId: string; quantity: number }[] = [];
    for (const su of stockUpdates) {
        const productId = byPos.get(su.pos_item_id);
        if (!productId) continue;
        out.push({ productId, quantity: Math.max(0, Math.trunc(su.quantity)) });
    }
    return out;
}

export async function resyncMerchantStock(
    merchantId: string,
    admin: SupabaseClient,
): Promise<StockResyncResult> {
    const conn = await getActivePosAccessToken(admin, merchantId);
    if (!conn) {
        return { merchant_id: merchantId, ok: false, updated: 0, fetched: 0, reason: "no_connection_or_token_expired" };
    }

    const { data: products } = await admin
        .from("products")
        .select("id, pos_item_id")
        .eq("merchant_id", merchantId)
        .not("pos_item_id", "is", null);

    const rows = (products ?? []) as { id: string; pos_item_id: string | null }[];
    const itemIds = rows.map((p) => p.pos_item_id!).filter(Boolean);
    if (itemIds.length === 0) {
        return { merchant_id: merchantId, ok: true, updated: 0, fetched: 0 };
    }

    let stockUpdates: POSStockUpdate[];
    try {
        stockUpdates = await conn.adapter.getStock(conn.accessToken, itemIds, {
            shopDomain: conn.shopDomain ?? undefined,
        });
    } catch (e) {
        captureError(e, { lib: "resync-stock", merchantId, provider: conn.provider });
        return { merchant_id: merchantId, ok: false, updated: 0, fetched: 0, reason: "getStock_failed" };
    }

    const mapped = mapStockUpdatesToProducts(rows, stockUpdates);
    let updated = 0;
    let writeErrors = 0;
    for (const m of mapped) {
        const nowIso = new Date().toISOString();
        const { error } = await admin.from("stock").upsert(
            { product_id: m.productId, quantity: m.quantity, updated_at: nowIso, source: "pos_sync", source_ts: nowIso },
            { onConflict: "product_id" },
        );
        if (error) {
            // Un échec d'écriture stock = dérive silencieuse (l'enjeu n°1 du produit).
            // On ne le masque plus derrière un statut "ok".
            writeErrors++;
            captureError(error, { lib: "resync-stock", merchantId, productId: m.productId });
        } else {
            updated++;
        }
    }

    // Statut honnête : "ok" seulement si TOUTES les écritures ont réussi.
    const allOk = writeErrors === 0;
    await admin
        .from("pos_connections")
        .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: allOk ? "ok" : "partial",
        })
        .eq("merchant_id", merchantId);

    return {
        merchant_id: merchantId,
        ok: allOk,
        updated,
        fetched: stockUpdates.length,
        ...(writeErrors > 0 && { reason: `${writeErrors} stock write(s) failed` }),
    };
}

/** Re-sync stock de TOUS les marchands ayant une connexion POS. */
export async function resyncAllMerchantsStock(admin: SupabaseClient): Promise<StockResyncResult[]> {
    const { data: conns } = await admin
        .from("pos_connections")
        .select("merchant_id")
        .limit(5000);

    const merchantIds = Array.from(new Set((conns ?? []).map((c: { merchant_id: string }) => c.merchant_id)));
    const results: StockResyncResult[] = [];
    for (const merchantId of merchantIds) {
        results.push(await resyncMerchantStock(merchantId, admin));
    }
    return results;
}
