/**
 * Source unique de vérité du `store_code` Google LFP d'un marchand.
 *
 * Historiquement DIVERGENT (cf. backlog autonomy "Unifier store_code") :
 * - Voie A (Content API : callback OAuth + crons google-feed / inventory)
 *   persistait `twostep-{id8}` dans `google_merchant_connections.store_code`.
 * - Voie B (feed XML public) émettait le `slug` du marchand comme store_code.
 *
 * → Pour un MÊME marchand, Google recevait DEUX store_code différents
 *   (`twostep-abc12345` vs `dear-skin`) = DEUX magasins fantômes distincts.
 *   L'inventaire poussé par Content API et l'inventaire crawlé en XML ne se
 *   réconciliaient jamais → faux positif LFP (l'enjeu n°1 du north-star :
 *   "afficher le stock honnêtement, zéro faux positif").
 *
 * Règle unique désormais : le store_code canonique est la valeur PERSISTÉE dans
 * `google_merchant_connections.store_code` (liée au compte Google et au futur
 * Business Profile). `defaultStoreCode` est le SEUL générateur du défaut, utilisé
 * à la connexion OAuth et en repli quand aucune connexion n'existe encore. Le
 * `slug` n'est plus jamais utilisé comme store_code.
 */

/**
 * Générateur déterministe du store_code par défaut d'un marchand.
 * Doit rester l'unique définition de cette formule (callback OAuth + feed XML
 * de repli) pour que Voie A et Voie B ne puissent plus diverger.
 */
export function defaultStoreCode(merchantId: string): string {
    return `twostep-${merchantId.slice(0, 8)}`;
}

/**
 * Résout le store_code canonique d'un marchand : la valeur persistée dans
 * `google_merchant_connections` prime ; à défaut (pas encore connecté, ou valeur
 * vide), on retombe sur le défaut déterministe — JAMAIS sur le slug.
 */
export function resolveStoreCode(
    merchantId: string,
    connectionStoreCode?: string | null,
): string {
    const persisted = connectionStoreCode?.trim();
    return persisted && persisted.length > 0
        ? persisted
        : defaultStoreCode(merchantId);
}
