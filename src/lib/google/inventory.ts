import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAccessToken, googleMerchantFetch } from "@/lib/google/merchant";
import { captureError } from "@/lib/error";

/**
 * Pur (testable) : normalise l'embed PostgREST `stock(quantity)` en une quantité.
 *
 * Supabase renvoie la relation `stock` soit en OBJET (to-one), soit en TABLEAU
 * (to-many), soit `null`/`[]` (aucune ligne stock). Une lecture incorrecte ici =
 * mauvaise quantité poussée à Google = FAUX POSITIF (un vendu affiché « in stock »
 * sur Google Shopping, l'ennemi n°1 du north-star). Défaut CONSERVATEUR : toute
 * forme illisible/absente → 0 (donc « out of stock »), jamais un faux « en stock ».
 */
export function resolveStockQuantity(stock: unknown): number {
    const raw = !stock
        ? 0
        : Array.isArray(stock)
          ? (stock[0]?.quantity ?? 0)
          : ((stock as { quantity?: unknown }).quantity ?? 0);
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

export type LocalInventoryPayload = {
    storeCode: string;
    productId: string;
    availability: "in stock" | "out of stock";
    quantity: string;
};

/**
 * Pur (testable) : construit le corps `localInventories:insert` envoyé à Google.
 *
 * INVARIANT VERROUILLÉ : `availability` est « in stock » / « out of stock » AVEC
 * ESPACE. La forme à underscore (« in_stock ») = REJET SILENCIEUX du feed côté
 * Google (cf. feed.ts + support.google.com/merchants/answer/6324448). Ce helper
 * existe pour que ce contrat soit testé une fois pour toutes, pas dispersé dans la
 * boucle d'I/O. `quantity` est sérialisé en string (attendu par l'API Merchant).
 */
export function buildLocalInventoryPayload(
    storeCode: string,
    productId: string,
    quantity: number,
): LocalInventoryPayload {
    return {
        storeCode,
        productId,
        availability: quantity > 0 ? "in stock" : "out of stock",
        quantity: quantity.toString(),
    };
}

/**
 * Push inventory updates to Google for a merchant.
 * Best-effort: never throws, always returns silently.
 * Called after POS sync and webhooks.
 */
export async function pushInventoryToGoogle(
    merchantId: string,
    productIds?: string[],
): Promise<void> {
    try {
        const auth = await getGoogleAccessToken(merchantId);
        if (!auth) return;

        const supabase = createAdminClient();

        let query = supabase
            .from("products")
            .select("id, ean, stock(quantity)")
            .eq("merchant_id", merchantId)
            .eq("visible", true)
            .not("ean", "is", null);

        if (productIds && productIds.length > 0) {
            query = query.in("id", productIds);
        }

        const { data: products, error: readError } = await query;
        // Une erreur de lecture NE DOIT PAS être confondue avec « aucun produit » :
        // un échec DB silencieux laisserait l'inventaire Google PÉRIMÉ (un vendu
        // resté « in stock ») sans aucune trace. On la rend visible (Sentry) avant
        // d'abandonner le push — best-effort conservé, mais plus en aveugle.
        if (readError) {
            captureError(readError, { merchantId, context: "google-inventory-read" });
            return;
        }
        if (!products || products.length === 0) return;

        const { connection, accessToken } = auth;
        const parent = `accounts/${connection.google_merchant_id}`;

        for (const product of products) {
            const quantity = resolveStockQuantity((product as { stock?: unknown }).stock);
            try {
                await googleMerchantFetch(
                    `/inventories/v1beta/${parent}/localInventories:insert`,
                    accessToken,
                    {
                        method: "POST",
                        body: JSON.stringify(
                            buildLocalInventoryPayload(connection.store_code, product.id, quantity),
                        ),
                    },
                );
            } catch (err) {
                captureError(err, {
                    merchantId,
                    productId: product.id,
                    // La quantité poussée fait partie du diagnostic : sur un rejet,
                    // savoir « quelle qté a-t-on tenté d'envoyer ? » est l'info clé
                    // pour un faux positif/négatif d'inventaire.
                    quantity,
                    context: "google-inventory-push",
                });
            }
        }
    } catch (err) {
        captureError(err, { merchantId, context: "google-inventory-push-top" });
    }
}
