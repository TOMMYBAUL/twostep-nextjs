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

/**
 * Prédicats par DIMENSION — `isFeedEligible` ET la ventilation par cause
 * (`summarizePublishability`) les partagent : le gate réel du feed et le KPI qui
 * PRÉDIT ce gate ne peuvent donc PAS diverger (même classe que store_code/honestSalePrice :
 * une garde répliquée se ré-aligne sur un helper unique).
 */
export function hasPublishableGtin(p: Pick<FeedEligibleRow, "ean">): boolean {
    return p.ean !== null && p.ean.length >= 8;
}
export function hasPublishablePrice(p: Pick<FeedEligibleRow, "price">): boolean {
    return p.price !== null && p.price > 0;
}
export function hasImage(p: Pick<FeedEligibleRow, "photo_url" | "photo_processed_url">): boolean {
    return p.photo_url !== null || p.photo_processed_url !== null;
}

export function isFeedEligible(p: FeedEligibleRow): boolean {
    return hasPublishableGtin(p) && hasPublishablePrice(p) && hasImage(p);
}

/**
 * KPI « % publiable » du pilote (item D3) — combien de produits sont RÉELLEMENT
 * publiables sur Google (`isFeedEligible`) vs exclus, ventilé par cause.
 *
 * `publishable` réutilise EXACTEMENT le gate du feed (pas un proxy `ean && price`
 * laxiste qui surévaluait : avant ce KPI comptait « éligibles » des produits SANS
 * image, au prix 0, ou au GTIN tronqué que le feed exclut en silence).
 *
 * Les compteurs de cause sont INDÉPENDANTS (un produit sans EAN ET sans image compte
 * dans les deux — cohérent avec les suggestions d'action « X sans photo / Y sans code »
 * du dashboard). `blocked_only_by_image` est le sous-ensemble ACTIONNABLE réconciliable :
 * EAN + prix OK, image seule manquante → cible directe du sourcing image (D2/D5).
 */
export interface PublishabilitySummary {
    /** Total de la population considérée (le caller filtre déjà visible+validated+non archivé+non variante). */
    total: number;
    /** Passe `isFeedEligible` = réellement poussable sur Google. */
    publishable: number;
    /** GTIN absent ou tronqué (<8 chiffres). */
    missing_ean: number;
    /** Prix absent ou ≤ 0. */
    missing_price: number;
    /** Aucune image (ni brute ni traitée). */
    missing_image: number;
    /** EAN + prix OK, SEULE l'image manque → une image suffirait à publier (cible D2/D5). */
    blocked_only_by_image: number;
    /** % publiable arrondi (0 si total = 0). */
    score: number;
}

export function summarizePublishability(rows: FeedEligibleRow[]): PublishabilitySummary {
    let publishable = 0;
    let missing_ean = 0;
    let missing_price = 0;
    let missing_image = 0;
    let blocked_only_by_image = 0;

    for (const p of rows) {
        const gtin = hasPublishableGtin(p);
        const price = hasPublishablePrice(p);
        const image = hasImage(p);

        if (gtin && price && image) {
            publishable++;
            continue;
        }
        if (!gtin) missing_ean++;
        if (!price) missing_price++;
        if (!image) missing_image++;
        if (gtin && price && !image) blocked_only_by_image++;
    }

    const total = rows.length;
    const score = total > 0 ? Math.round((publishable / total) * 100) : 0;
    return { total, publishable, missing_ean, missing_price, missing_image, blocked_only_by_image, score };
}
