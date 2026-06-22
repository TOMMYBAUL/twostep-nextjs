/**
 * Éligibilité au feed Google — SOURCE UNIQUE partagée par les 2 canaux de sortie.
 *
 * Voie A (`feed.ts` → Content API) et Voie B (`lfp-xml.ts` → feed XML crawlé) doivent émettre
 * EXACTEMENT le MÊME ensemble de produits (LESSONS maillon 7 : « les N canaux de sortie vers une
 * même plateforme doivent émettre le même ensemble »). Avant centralisation, les deux filtres
 * divergeaient : Voie B exigeait `ean.length >= 8` ET `price > 0`, Voie A non → un produit au
 * prix 0 ou au GTIN tronqué partait sur Content API (rejet/faux positif Google) mais pas sur le
 * feed XML. Ce prédicat ferme la divergence.
 *
 * Conditions communes (identité publiable Google) : GTIN valide (8–14 chiffres → `length >= 8`),
 * prix strictement positif, au moins une image. La visibilité (`visible`/`review_status`) est
 * filtrée EN AMONT au niveau SQL par les deux routes (et redondamment par Voie A) — pas ici, car
 * `LfpProductRow` ne porte pas `visible`.
 */
export interface FeedEligibleRow {
    ean: string | null;
    price: number | null;
    photo_url: string | null;
    photo_processed_url: string | null;
}

export function isFeedEligible(p: FeedEligibleRow): boolean {
    return (
        p.ean !== null &&
        p.ean.length >= 8 &&
        p.price !== null &&
        p.price > 0 &&
        (p.photo_url !== null || p.photo_processed_url !== null)
    );
}
