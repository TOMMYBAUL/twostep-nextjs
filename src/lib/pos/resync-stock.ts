import type { SupabaseClient } from "@supabase/supabase-js";
import type { POSStockUpdate } from "@/lib/pos/types";
import { getActivePosAccessToken } from "@/lib/pos/access-token";
import { captureError } from "@/lib/error";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { chunk } from "@/lib/ingest/reconcile";

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

    // PAGINÉ (KEYSET, cf. fetchAllRows) : un SELECT non borné est tronqué à 1000 lignes
    // par PostgREST SANS erreur → sur un catalogue >1000 (Deerskin = milliers de SKU),
    // les produits au-delà du 1000ᵉ sortaient de l'index pos_item_id → leur dérive de
    // stock n'était JAMAIS guérie par ce chemin d'auto-guérison (l'enjeu n°1), en silence.
    const { data: products, error: productsErr } = await fetchAllRows<{ id: string; pos_item_id: string | null }>(() =>
        admin
            .from("products")
            .select("id, pos_item_id")
            .eq("merchant_id", merchantId)
            .not("pos_item_id", "is", null)
            .order("id", { ascending: true }),
    );

    // Un échec de lecture NE DOIT PAS être confondu avec « 0 produit suivi » :
    // sinon resync retourne `ok:true, fetched:0` (voyant vert) alors que la dérive
    // de stock n'a PAS été guérie et que rien ne l'alerte. On rend l'échec visible.
    if (productsErr) {
        captureError(productsErr, { lib: "resync-stock", merchantId, phase: "read-products" });
        return { merchant_id: merchantId, ok: false, updated: 0, fetched: 0, reason: "products_read_failed" };
    }

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
    // DÉDUP par product_id (dernier gagne) : deux updates POS sur le même produit dans
    // un même lot feraient échouer l'upsert Postgres (« ON CONFLICT ... cannot affect
    // row a second time ») — même motif que le flush stock de ingest/snapshot.
    const nowIso = new Date().toISOString();
    const stockByProduct = new Map<string, { product_id: string; quantity: number; updated_at: string; source: string; source_ts: string }>();
    for (const m of mapped) {
        stockByProduct.set(m.productId, {
            product_id: m.productId,
            quantity: m.quantity,
            updated_at: nowIso,
            source: "pos_sync",
            source_ts: nowIso,
        });
    }

    // Écriture PAR LOTS de 500 (pattern snapshot.ts) : l'ancienne boucle faisait UN
    // aller-retour réseau par produit → sur des milliers de SKU, le cron dépassait son
    // budget temps Vercel → kill en plein vol = produits restants jamais guéris (même
    // classe de troncature silencieuse que la lecture non paginée ci-dessus).
    let updated = 0;
    let writeErrors = 0;
    for (const batch of chunk([...stockByProduct.values()], 500)) {
        const { error: batchErr } = await admin.from("stock").upsert(batch, { onConflict: "product_id" });
        if (!batchErr) {
            updated += batch.length;
            continue;
        }
        // Lot en échec → repli MONO-LIGNE : isole la faute (1 ligne toxique ne doit pas
        // faire perdre 499 écritures saines), et chaque échec reste VISIBLE (Sentry),
        // jamais masqué derrière un statut "ok" (dérive de stock = enjeu n°1).
        for (const row of batch) {
            const { error } = await admin.from("stock").upsert(row, { onConflict: "product_id" });
            if (error) {
                writeErrors++;
                captureError(error, { lib: "resync-stock", merchantId, productId: row.product_id });
            } else {
                updated++;
            }
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
    // PAGINÉ (KEYSET) : l'ancien `.limit(5000)` était PLAFONNÉ à 1000 par `max-rows`
    // PostgREST (sans erreur) → au-delà de 1000 connexions POS, les marchands suivants
    // n'étaient JAMAIS resynchronisés, en silence. Curseur = `id` (PK) : `merchant_id`
    // n'est PAS unique dans pos_connections (UNIQUE(merchant_id, provider)).
    const { data: conns, error: connsErr } = await fetchAllRows<{ id: string; merchant_id: string }>(() =>
        admin
            .from("pos_connections")
            .select("id, merchant_id")
            .order("id", { ascending: true }),
    );

    // Si la liste des connexions n'est pas lisible, on LÈVE : un `?? []` silencieux
    // ferait que le cron « ne guérit personne » en se rapportant ok — le cron
    // (try/catch) transforme ça en 500 + Sentry au lieu d'un faux succès.
    if (connsErr) {
        throw new Error(`Lecture des connexions POS échouée (resync de tous les marchands annulé): ${connsErr.message}`);
    }

    const merchantIds = Array.from(new Set((conns ?? []).map((c: { merchant_id: string }) => c.merchant_id)));
    const results: StockResyncResult[] = [];
    for (const merchantId of merchantIds) {
        results.push(await resyncMerchantStock(merchantId, admin));
    }
    return results;
}
