/**
 * Honnêteté d'affichage du prix promo — north-star « afficher honnêtement, zéro faux positif ».
 *
 * Un `sale_price` ne doit être renvoyé (et donc affiché en « -X% » / prix barré) QUE s'il est
 * un VRAI rabais : strictement inférieur au prix courant du produit.
 *
 * Pourquoi une garde au READ alors que le POST /promotions vérifie déjà `sale_price < price` ?
 * Parce que la garde de création est figée dans le temps : le `sale_price` d'une promo active
 * est fixe, mais le `price` du produit peut BAISSER ensuite (re-ingest fichier, sync POS,
 * correction marchand) sous une promo encore active (`ends_at` futur). On obtient alors une
 * promo périmée dont le « prix promo » est ≥ au prix courant → affichée comme un faux rabais.
 * Concrètement, `followed-feed` calcule `Math.round((price - sale) / price * 100)` → pourcentage
 * NÉGATIF / aberrant ; le prix barré montre un montant INFÉRIEUR au « prix promo » mis en avant.
 *
 * Règle (LESSONS, maillon 5) : une garde posée au WRITE doit être appliquée symétriquement au
 * READ — le point où le prix courant et le sale_price se rencontrent. Cette fonction est la
 * SOURCE UNIQUE de cette règle côté serveur : toutes les routes qui émettent `sale_price` la
 * traversent — `discover`, `products/discover`, `by-merchants`, `search`, `feed/promos`, et
 * `products/[id]` (filtre la jointure `promotions`) — donc tout front consommateur reçoit un
 * sale_price honnête sans avoir à re-garder côté client (les gardes existantes
 * `sticky-cta-bar`/`explorer-feed` deviennent une redondance inoffensive). NB : `shop-profile`
 * interroge encore `promotions` directement côté client (hors de cette source) — suivi worklog.
 *
 * Sémantique alignée EXACTEMENT sur les gardes client existantes (`salePrice != null &&
 * salePrice < price`), durcie pour les entrées non finies/nulles.
 *
 * @returns le `salePrice` s'il est un vrai rabais, sinon `null`.
 */
export function honestSalePrice(
    price: number | null | undefined,
    salePrice: number | null | undefined,
): number | null {
    if (salePrice == null || price == null) return null;
    if (!Number.isFinite(salePrice) || !Number.isFinite(price)) return null;
    if (salePrice >= price) return null; // pas un rabais → ne jamais afficher de promo
    return salePrice;
}
