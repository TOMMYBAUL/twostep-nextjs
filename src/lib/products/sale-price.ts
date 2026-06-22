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

/** Ligne `promotions` telle que jointe par les feeds (sous-ensemble des colonnes migration 001). */
export interface FeedPromoRow {
    sale_price: number | null;
    starts_at?: string | null;
    ends_at?: string | null;
}

/**
 * Une promo est ACTIVE à l'instant `nowMs` si sa fenêtre l'englobe.
 * `starts_at` a un DEFAULT now() en DB (toujours posé) ; on traite une borne absente ou
 * illisible comme « pas de contrainte » (prudence : on ne fabrique pas de promo, mais on ne
 * la masque pas non plus sur un timestamp corrompu — l'honnêteté du PRIX est gardée à part).
 */
function isPromoActive(p: FeedPromoRow, nowMs: number): boolean {
    // Bornes INCLUSIVES : starts_at == now → commencée ; ends_at == now → encore active.
    // (En pratique `starts_at` est `timestamptz NOT NULL DEFAULT now()` et `ends_at` un
    // timestamptz nullable — PostgREST renvoie donc toujours de l'ISO valide ; le garde
    // `Number.isFinite` reste une ceinture-bretelles, jamais déclenché par le schéma 001.)
    if (p.starts_at) {
        const s = Date.parse(p.starts_at);
        if (Number.isFinite(s) && s > nowMs) return false; // pas encore commencée
    }
    if (p.ends_at) {
        const e = Date.parse(p.ends_at);
        if (Number.isFinite(e) && e < nowMs) return false; // déjà terminée
    }
    return true;
}

/**
 * Prix promo à ANNONCER dans un feed sortant (Google Voie A + Voie B), ou `null`.
 *
 * Réutilise `honestSalePrice` (source unique de la règle « vrai rabais ») et n'admet qu'une
 * promo ACTIVE (fenêtre `starts_at`/`ends_at`). Parmi les promos actives honnêtes, renvoie le
 * MEILLEUR rabais (sale_price le plus bas). Cohérent avec l'affichage consumer : on ne pousse à
 * Google qu'un prix promo qui est réellement un rabais sur le prix courant — sinon faux « -X% »
 * côté Google (north-star : afficher honnêtement). On n'émet PAS de `sale_price_effective_date` :
 * le feed reflète l'état COURANT (re-push cron 3h / re-crawl ISR 15 min), comme availability/price ;
 * la promo disparaît du feed dès qu'elle expire — pas d'intervalle à maintenir.
 */
export function activeFeedSalePrice(
    price: number | null | undefined,
    promotions: FeedPromoRow[] | null | undefined,
    nowMs: number,
): number | null {
    if (!Array.isArray(promotions) || promotions.length === 0) return null;
    let best: number | null = null;
    for (const promo of promotions) {
        if (!isPromoActive(promo, nowMs)) continue;
        const honest = honestSalePrice(price, promo.sale_price);
        if (honest == null) continue;
        if (best == null || honest < best) best = honest;
    }
    return best;
}
