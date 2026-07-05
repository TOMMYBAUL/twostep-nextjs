import type { SupabaseClient } from "@supabase/supabase-js";
import { captureError } from "@/lib/error";

/**
 * Longueur minimale d'un SKU pour l'utiliser comme CLÉ D'IDENTITÉ — c.-à-d. adopter
 * l'EAN d'un AUTRE produit qui partage ce SKU (stratégie « SKU match » de
 * l'enrichissement, quand aucun EAN n'est déclaré au fichier).
 *
 * Un SKU trop court ("1", "AB") n'est PAS assez discriminant : il matcherait des
 * produits sans rapport et ferait adopter une identité au hasard. Même seuil que
 * la recherche d'image (`serper.ts` : une référence ≥4 chars est auto-suffisante).
 */
export const MIN_SKU_IDENTITY_LENGTH = 4;

/** Pur : ce SKU est-il assez spécifique pour adopter l'identité (EAN) d'un jumeau ? */
export function isSpecificSku(sku: string | null | undefined): boolean {
    return (sku?.trim().length ?? 0) >= MIN_SKU_IDENTITY_LENGTH;
}

/**
 * Cherche l'EAN d'un AUTRE produit **du même marchand** qui partage ce SKU.
 *
 * P0-11 (2026-07-05) — source UNIQUE de la règle « SKU match » (auparavant DUPLIQUÉE
 * dans `enrich-product.ts` ET `resolve-ean.ts`, d'où deux instances du même bug).
 *
 * Deux gardes contre l'injection d'une FAUSSE identité (« zéro faux positif », le
 * cœur du north-star) :
 *  1. **Scope marchand** (`merchant_id`) : un SKU est un code INTERNE au marchand
 *     ("TS-0042", "REF123") — il n'a aucun sens global. Sans ce filtre, le marchand B
 *     héritait l'EAN (et donc la photo/marque/catégorie) d'un produit du marchand A
 *     partageant le même SKU = fausse identité cross-marchand (plafonnée `pending`,
 *     mais 1 tap la publie). C'est la famille du bug « 6/7 photos fausses ».
 *  2. **Longueur ≥ `MIN_SKU_IDENTITY_LENGTH`** : un SKU trivial ne peut pas ancrer
 *     une identité (cf. `isSpecificSku`).
 *
 * Retourne l'EAN partagé, ou `null` si aucun (SKU absent/trop court, aucun jumeau,
 * ou blip DB → conservateur : on ne devine pas d'identité sur une lecture douteuse).
 */
export async function findSharedSkuEan(
    admin: SupabaseClient,
    merchantId: string,
    sku: string | null | undefined,
    excludeProductId: string,
): Promise<string | null> {
    if (!isSpecificSku(sku)) return null;

    const { data, error } = await admin
        .from("products")
        .select("ean")
        .eq("merchant_id", merchantId)
        .eq("sku", sku)
        .not("ean", "is", null)
        .neq("id", excludeProductId)
        .limit(1)
        .single();

    // Discriminateur (leçon E5) : `.single()` renvoie PGRST116 quand 0 ligne = « aucun
    // jumeau au même SKU chez ce marchand » = cas NOMINAL (ne rien logger). Tout AUTRE
    // code = vrai blip DB → rendu VISIBLE (Sentry) : sinon un outage se lirait « pas de
    // SKU partagé » et le produit filerait en reverse-search/photo sans aucune trace.
    // On reste conservateur (null = on n'adopte pas d'identité sur une lecture douteuse).
    if (error && (error as { code?: string }).code !== "PGRST116") {
        captureError(error, { module: "sku-identity", phase: "shared-sku-lookup", merchantId, sku });
    }

    return (data?.ean as string | null) ?? null;
}
