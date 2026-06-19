/**
 * Réconciliation de décrémentation pour les snapshots de stock.
 *
 * Problème résolu : un push de stock ne contient souvent que les articles EN STOCK.
 * Quand un article tombe à 0, il DISPARAÎT de l'export. Sans réconciliation, son
 * ancienne quantité resterait affichée → faux positif "en stock" (le scénario qui
 * tue la confiance). On doit donc mettre à 0 les produits déjà connus mais absents
 * du nouveau push.
 *
 * Garde-fou critique : si l'export est tronqué (réseau coupé, fichier partiel), on
 * remettrait tout le magasin à 0 par erreur. On refuse donc de réconcilier quand le
 * push couvre une fraction anormalement faible du catalogue en stock.
 */

export type InStockProduct = { id: string; quantity: number };

export type ReconcileDecision = {
    /** IDs des produits à passer à stock 0 (présents avant, absents du push). */
    toZero: string[];
    /** true si la réconciliation a été ANNULÉE par le garde-fou (push suspect). */
    skipped: boolean;
    reason?: string;
};

/**
 * Décide quels produits passer à 0 après un push snapshot.
 *
 * @param touchedProductIds  IDs des produits présents dans CE push (créés ou mis à jour).
 * @param existingInStock    Produits du marchand ayant actuellement une quantité > 0.
 * @param opts.minCoverageRatio  Couverture minimale (touchés/total en stock) en dessous
 *   de laquelle on suspecte un fichier partiel et on annule. Défaut 0.5.
 * @param opts.minCatalogForGuard  Taille de catalogue en stock en dessous de laquelle
 *   le garde-fou ne s'applique pas (petits catalogues : une grosse variation est normale).
 *   Défaut 10.
 */
export function selectProductsToZero(
    touchedProductIds: Set<string>,
    existingInStock: InStockProduct[],
    opts?: { minCoverageRatio?: number; minCatalogForGuard?: number },
): ReconcileDecision {
    const ratio = opts?.minCoverageRatio ?? 0.5;
    const minCatalog = opts?.minCatalogForGuard ?? 10;
    const total = existingInStock.length;

    if (total === 0) return { toZero: [], skipped: false };

    const touchedInStock = existingInStock.filter((p) => touchedProductIds.has(p.id)).length;
    const coverage = touchedInStock / total;

    // Garde-fou : push anormalement partiel sur un catalogue non-trivial → on n'efface rien.
    if (total >= minCatalog && coverage < ratio) {
        return {
            toZero: [],
            skipped: true,
            reason: `couverture ${(coverage * 100).toFixed(0)}% < ${(ratio * 100).toFixed(0)}% sur ${total} produits — push probablement partiel, réconciliation annulée`,
        };
    }

    const toZero = existingInStock
        .filter((p) => !touchedProductIds.has(p.id))
        .map((p) => p.id);

    return { toZero, skipped: false };
}

/**
 * Découpe un tableau en lots de taille `size` (pur, testable).
 *
 * Utilisé pour borner les écritures de réconciliation : un seul
 * `.in("product_id", [...])` sur des milliers d'UUID construit une URL PostgREST
 * de plusieurs centaines de Ko → dépasse la limite serveur → la réconciliation
 * échoue EN BLOC (faux "en stock" persistant). On batch comme le sync POS.
 */
export function chunk<T>(arr: T[], size: number): T[][] {
    if (size <= 0) return [arr];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}
