/**
 * Anti cold-start : un nouveau marchand a 0 produit enrichi pendant 24-48 h
 * (latence cascade). Sans traitement, sa boutique apparaît VIDE côté consommateur
 * — première impression catastrophique, pin mort sur la carte.
 *
 * Règle : un marchand n'est "prêt" (affichable comme boutique active avec
 * produits) qu'au-delà d'un seuil de produits visibles. En dessous, il est en
 * "onboarding" (à masquer de la carte/feed, ou à afficher avec un état dédié
 * "nouvelle boutique" plutôt qu'une vitrine vide).
 */

export type MerchantDisplayState = "ready" | "onboarding" | "empty";

export const MIN_VISIBLE_FOR_READY = 3;

/**
 * @param visibleCount nombre de produits visibles (validés ≥0,95) du marchand.
 * @param totalCount   nombre total de produits (visibles + en attente).
 */
export function merchantDisplayState(visibleCount: number, totalCount: number): MerchantDisplayState {
    if (visibleCount >= MIN_VISIBLE_FOR_READY) return "ready";
    if (totalCount > 0) return "onboarding"; // a des produits, mais pas encore assez de publiés
    return "empty";
}

/** Un marchand doit-il apparaître sur la carte/feed consommateur ? */
export function shouldShowOnMap(visibleCount: number): boolean {
    return visibleCount >= MIN_VISIBLE_FOR_READY;
}
