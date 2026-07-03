/**
 * Monitoring qualité de la donnée stock/produit.
 *
 * Au service du "zéro faux positif" : on détecte les données suspectes AVANT
 * qu'elles ne dégradent l'expérience consommateur.
 *
 * Deux détections clés (best-effort avec les signaux disponibles aujourd'hui) :
 *  - STOCK FIGÉ (phantom inventory) : quantité > 0 mais aucun mouvement depuis N
 *    jours → probablement faux "en stock". Cause ~20-30% des ruptures réelles.
 *  - PRIX ABERRANT : prix hors des bornes robustes de sa catégorie (faute de
 *    saisie, mauvais parsing facture) ou ≤ 0.
 *
 * Helpers purs (testables) ; l'orchestration DB vit dans la route cron.
 */

const DAY_MS = 86_400_000;

/** Stock figé : quantité positive et dernière mise à jour antérieure à N jours. */
export function isStockStale(
    lastUpdatedAt: Date | string | null,
    quantity: number,
    now: Date,
    staleDays = 21,
): boolean {
    if (quantity <= 0) return false;
    if (!lastUpdatedAt) return true; // jamais mis à jour + en stock = suspect
    const ageDays = (now.getTime() - new Date(lastUpdatedAt).getTime()) / DAY_MS;
    return ageDays >= staleDays;
}

/**
 * Dérive de complétude « produit vendable rendu INVISIBLE » (perte silencieuse n°1, north-star §1).
 *
 * Un PRINCIPAL (`variant_of IS NULL`) NON-pending, avec un nom et du stock > 0, DEVRAIT être
 * visible — c'est la règle de `groupVariantsByEAN`, dont on détecte la VIOLATION (source unique :
 * on ne re-dérive pas une 2ᵉ logique de visibilité). S'il est `visible=false`, un chemin l'a laissé
 * masqué/orphelin SANS re-groupage (ex. correction manuelle d'EAN → relâche `variant_of` puis regroup
 * échoué ; un marchand sans caisse ni facture n'a AUCUN re-trigger périodique) → le produit est
 * vendable mais ABSENT du feed Google ET de la vitrine = silencieusement PERDU.
 *
 * ⚠️ Parité VOLONTAIREMENT CONSERVATRICE : `groupVariantsByEAN` n'exige un nom que sur sa branche
 * sans-EAN ; ses branches solo/groupe-EAN rendent visible sur `stock>0` SEUL. Ici on exige TOUJOURS
 * un nom (`!name` → non flag) : un produit sans nom ne devrait de toute façon pas être au feed, et
 * flag l'absence de nom serait du bruit. Conséquence assumée : une fiche EAN SANS nom coincée
 * `visible=false` n'est PAS signalée (angle mort étroit — les produits POS portent un nom en
 * pratique). Le masquage DÉLIBÉRÉ (route `reject`/`DELETE` soft-delete/PATCH `visible=false`) pose
 * `review_status='rejected'` → exclu par la garde pending → JAMAIS un faux positif.
 *
 * EXCLUT les invisibilités LÉGITIMES (« zéro faux positif ») :
 *  - pending/masked/pending_review (`review_status` ∉ {null,'validated'}) : le marchand n'a pas
 *    encore validé l'enrichissement → invisible VOULU jusqu'à validation ;
 *  - fiche sans nom : incomplète → invisible VOULU ;
 *  - une VRAIE variante (`variant_of` non-null) : masquée à dessein, son stock roule vers le principal ;
 *  - stock ≤ 0 : rupture légitime, rien à perdre.
 *
 * `visible` doit être EXPLICITEMENT `false` (colonne `DEFAULT true`, migration 027) : null/undefined
 * (donnée absente) n'est PAS une dérive prouvée → on ne flag pas au hasard.
 */
export function isInvisibleOrphan(input: {
    variantOf: string | null | undefined;
    visible: boolean | null | undefined;
    quantity: number;
    reviewStatus: string | null | undefined;
    name: string | null | undefined;
}): boolean {
    if (input.variantOf != null) return false; // vraie variante masquée = légitime
    if (input.visible !== false) return false; // seul `false` explicite = masqué à tort
    if (!(input.quantity > 0)) return false; // pas de stock = rien à perdre
    if (input.reviewStatus != null && input.reviewStatus !== "validated") return false; // pending = légitime
    if (!input.name || input.name.trim().length === 0) return false; // fiche incomplète = légitime
    return true;
}

export type PriceBounds = {
    lower: number;
    upper: number;
    median: number;
    count: number;
};

function quantile(sorted: number[], q: number): number {
    if (sorted.length === 0) return NaN;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return sorted[base + 1] !== undefined
        ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
        : sorted[base];
}

/**
 * Bornes robustes (IQR) des prix d'une catégorie. Tukey k=3 (extrêmes), pour ne
 * flagger que les vraies aberrations, pas la variance normale d'un assortiment.
 * Retourne null si l'échantillon est trop petit pour être fiable (< 8).
 */
export function computeCategoryPriceBounds(prices: number[], k = 3): PriceBounds | null {
    const clean = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
    if (clean.length < 8) return null;
    const q1 = quantile(clean, 0.25);
    const q3 = quantile(clean, 0.75);
    const iqr = q3 - q1;
    return {
        lower: Math.max(0, q1 - k * iqr),
        upper: q3 + k * iqr,
        median: quantile(clean, 0.5),
        count: clean.length,
    };
}

/**
 * Un prix est aberrant s'il est ≤ 0, ou hors des bornes robustes de sa catégorie.
 * Sans bornes (catégorie trop petite), seul le prix ≤ 0 est aberrant.
 */
export function isPriceAberrant(price: number | null | undefined, bounds: PriceBounds | null): boolean {
    if (price == null || !Number.isFinite(price) || price <= 0) return true;
    if (!bounds) return false;
    return price < bounds.lower || price > bounds.upper;
}
