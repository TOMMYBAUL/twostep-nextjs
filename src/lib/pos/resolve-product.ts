import type { SupabaseClient } from "@supabase/supabase-js";
import { captureError } from "@/lib/error";

export type ResolvedProduct = { id: string; merchant_id: string };

/**
 * Choisit LE produit unique parmi des candidats matchés par pos_item_id.
 * Rend la collision multi-tenant VISIBLE au lieu d'un skip silencieux.
 *  - 1 candidat  → le produit (non ambigu).
 *  - 0 candidat  → null, non ambigu (cas normal : produit non suivi).
 *  - ≥2 candidats → null + ambiguous=true (pos_item_id partagé entre marchands :
 *    ex. itemID Lightspeed par compte → ne PAS appliquer la vente au mauvais marchand).
 */
export function pickUniqueProduct<T>(rows: T[] | null | undefined): { product: T | null; ambiguous: boolean } {
    const list = rows ?? [];
    if (list.length === 1) return { product: list[0], ambiguous: false };
    if (list.length === 0) return { product: null, ambiguous: false };
    return { product: null, ambiguous: true };
}

/**
 * Résout le produit d'un webhook par pos_item_id, SANS choisir au hasard en cas de
 * collision multi-tenant (cf. worklog Collecte ③ passe 2). En cas d'ambiguïté on
 * loggue (Sentry) et on renvoie null → la vente n'est pas appliquée mais devient
 * VISIBLE. Fix de fond = scoper par marchand (design + migration, supervisé).
 *
 * Distinction CRITIQUE erreur-DB vs produit-non-suivi : `null` SANS lever ne signifie
 * QUE « pos_item_id non rattaché à un produit » (cas normal). Un échec de LECTURE
 * (DB indispo, RLS, réseau) **LÈVE** au lieu de retomber sur `null` — sinon un événement
 * stock temps réel serait perdu silencieusement (le webhook répondrait 200, le POS ne
 * renverrait jamais) = perte silencieuse north-star n°1. Le throw remonte au catch de la
 * route → captureError + 500 → retry POS (absolu : événement récupéré ; delta : au moins
 * rendu VISIBLE, l'idempotence amont protège du double-décrément).
 */
export async function resolveWebhookProduct(
    supabase: SupabaseClient,
    posItemId: string,
    provider: string,
): Promise<ResolvedProduct | null> {
    const { data, error } = await supabase
        .from("products")
        .select("id, merchant_id")
        .eq("pos_item_id", posItemId);
    if (error) {
        throw new Error(
            `Webhook ${provider}: échec lecture produit pour pos_item_id "${posItemId}" — ${error.message}`,
        );
    }
    const { product, ambiguous } = pickUniqueProduct(data as ResolvedProduct[] | null);
    if (ambiguous) {
        captureError(
            new Error(
                `Webhook ${provider}: pos_item_id "${posItemId}" partagé par plusieurs marchands — vente NON appliquée (scoping marchand requis)`,
            ),
            { route: `webhooks/${provider}`, phase: "resolve-product", posItemId },
        );
    }
    return product;
}
