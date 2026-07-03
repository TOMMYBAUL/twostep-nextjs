import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAccessToken, googleMerchantFetch } from "@/lib/google/merchant";
import { captureError } from "@/lib/error";
import { feedAvailability, type FeedStockRow, type GoogleAvailability } from "@/lib/google/feed-availability";
import { fetchAllRows } from "@/lib/supabase/paginate";

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
    availability: GoogleAvailability;
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
 *
 * `availability` est CALCULÉE PAR LE CALLER via `feedAvailability` (M5 : fraîcheur
 * `source_ts` + force de source) — plus jamais le `quantity > 0` brut qui poussait
 * un stock manuel/périmé « in stock » (faux positif n°1). COHÉRENCE du payload :
 * quand `availability` est « out of stock » (rupture OU confiance insuffisante), la
 * quantité émise est plafonnée à 0 — un `quantity: "5"` accolé à « out of stock »
 * laisserait Google inférer une dispo qu'on ne peut pas promettre.
 */
export function buildLocalInventoryPayload(
    storeCode: string,
    productId: string,
    quantity: number,
    availability: GoogleAvailability,
): LocalInventoryPayload {
    return {
        storeCode,
        productId,
        availability,
        quantity: (availability === "out of stock" ? 0 : quantity).toString(),
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

        // PAGINÉ : un SELECT non borné est tronqué à 1000 lignes par PostgREST (sans
        // erreur) → un marchand >1000 produits visibles aurait son inventaire Google
        // mis à jour PARTIELLEMENT (les produits au-delà du 1000ᵉ restent périmés =
        // un vendu affiché « in stock » sur Google Shopping = faux positif n°1).
        // `fetchAllRows` lit tout ; `.order("id")` = ordre déterministe entre pages.
        // Parité avec les 3 autres sorties Google (Voie A cron, Voie B XML, feed-preview).
        // NB : le filtre `.in("id", productIds)` (push ciblé post-sync) reste appliqué —
        // la pagination ne change que le cas non borné (push catalogue complet).
        const { data: products, error: readError } = await fetchAllRows(() => {
            let query = supabase
                .from("products")
                // `stock(quantity, source, source_ts, updated_at)` : colonnes REQUISES par la
                // disponibilité honnête M5 (`feedAvailability`) — parité avec les 3 autres
                // sorties Google (Voie A cron, Voie B XML, feed-preview).
                .select("id, ean, stock(quantity, source, source_ts, updated_at)")
                .eq("merchant_id", merchantId)
                .eq("visible", true)
                // PARITÉ DE POPULATION avec le feed (Voie A `feed.ts`, Voie B `lfp-xml.ts`,
                // `feed-preview`) : sans ces 3 filtres, un produit ARCHIVÉ / NON VALIDÉ / VARIANTE
                // — exclu du feed — voyait quand même son inventaire poussé « in stock » sur Google
                // (localInventories:insert) = faux positif n°1, le mensonge exact que le projet promet
                // d'éliminer. Mêmes prédicats que la population des 3 autres sorties Google.
                .eq("review_status", "validated")
                .is("archived_at", null)
                .is("variant_of", null)
                .not("ean", "is", null);

            if (productIds && productIds.length > 0) {
                query = query.in("id", productIds);
            }

            return query.order("id", { ascending: true });
        });
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

        // Horloge capturée UNE fois pour tout le push (parité intra-feed avec les 2 feeds) :
        // le même produit ne doit pas basculer in/out entre le début et la fin de la boucle.
        const nowMs = Date.now();

        for (const product of products) {
            const stock = (product as { stock?: unknown }).stock as
                | FeedStockRow
                | FeedStockRow[]
                | null
                | undefined;
            const quantity = resolveStockQuantity(stock);
            // Disponibilité HONNÊTE (M5, `feedAvailability`) — plus jamais `quantity > 0` brut :
            // un stock manuel/périmé part « out of stock » (conservateur, north-star).
            const availability = feedAvailability(stock, nowMs);
            try {
                await googleMerchantFetch(
                    `/inventories/v1beta/${parent}/localInventories:insert`,
                    accessToken,
                    {
                        method: "POST",
                        body: JSON.stringify(
                            buildLocalInventoryPayload(connection.store_code, product.id, quantity, availability),
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
                    availability,
                    context: "google-inventory-push",
                });
            }
        }
    } catch (err) {
        captureError(err, { merchantId, context: "google-inventory-push-top" });
    }
}
