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
    // Non-vide : une chaîne `""` (ex. colonne back-fillée en "" au lieu de NULL) n'est PAS une
    // image publiable — elle passait `!== null` mais produit un `g:image_link` vide que Google
    // rejette. Compter ces produits comme « sans image » est honnête (KPI) et sûr (le tier D2
    // les routera correctement en GTIN-only au lieu d'émettre une balise image vide).
    return (
        (p.photo_url !== null && p.photo_url !== "") ||
        (p.photo_processed_url !== null && p.photo_processed_url !== "")
    );
}

/**
 * Tier « GTIN-only » (item D2) — FLAG, OFF par défaut.
 *
 * Quand activé (`GOOGLE_GTIN_ONLY_TIER=1`/`true`), les produits SANS image mais avec
 * GTIN + prix valides deviennent éligibles au feed : Google enrichit la tête de catalogue
 * depuis le GTIN (trick NearSt — `g:image_link` omis → matching par code-barres). Ce tier
 * peut affecter la réputation du compte Google (taux de rejet) → activation = décision Thomas,
 * mesurée par le cron `google-status` + `quality_alerts google_disapproved`. **Ne PAS activer
 * sans GO.** Tant qu'OFF, le gate exige toujours une image (`hasImage`).
 *
 * Lu À CHAQUE appel des deux filtres de sortie (Voie A `feed.ts` + Voie B `lfp-xml.ts`) → les
 * deux canaux émettent le MÊME ensemble (parité, source unique — cf. LESSONS maillon 7).
 */
export function gtinOnlyTierEnabled(
    env: Record<string, string | undefined> = process.env,
): boolean {
    const v = env.GOOGLE_GTIN_ONLY_TIER;
    return v === "1" || v === "true";
}

export interface FeedEligibilityOptions {
    /**
     * Tier GTIN-only (D2) : l'image n'est PAS requise (Google enrichit depuis le GTIN).
     * Défaut `false` (image obligatoire). N'est passé `true` que par les filtres de feed
     * quand `gtinOnlyTierEnabled()` est vrai.
     */
    allowMissingImage?: boolean;
}

export function isFeedEligible(p: FeedEligibleRow, opts: FeedEligibilityOptions = {}): boolean {
    // Délègue à `classifyFeedRow` (source unique) : le gate du feed et la ventilation PAR PRODUIT
    // des causes de blocage (mode shadow/preview) ne peuvent donc PAS diverger. `eligible` ⟺
    // `reasons.length === 0` ⟺ (gtin ∧ prix ∧ (allowMissingImage ∨ image)) = l'ancienne condition,
    // byte-for-byte (équivalence vérifiée par `tests/lib/google/feed-preview-classify.test.ts`).
    return classifyFeedRow(p, opts).eligible;
}

/**
 * Causes de blocage stables (machine-readable) d'un produit hors du feed Google — le mode
 * shadow/preview (« montrer au marchand ce qu'on publierait AVANT de publier ») et le dashboard
 * mappent ces codes vers un libellé FR. Codes (pas des libellés) pour ne pas casser un consommateur
 * quand le texte change. Mêmes dimensions que `PublishabilitySummary` (un seul vocabulaire de cause).
 */
export type FeedBlockReason = "missing_ean" | "missing_price" | "missing_image";

export interface FeedRowClassification {
    /** Le produit passe le gate du feed (`isFeedEligible`) = serait réellement publié. */
    eligible: boolean;
    /** Causes de NON-publication (vide ssi `eligible`). Ordre stable : ean, prix, image. */
    reasons: FeedBlockReason[];
}

/**
 * Classe UN produit pour le feed Google : éligible ou bloqué + POURQUOI (par produit).
 *
 * Réutilise EXACTEMENT les mêmes prédicats que `isFeedEligible`/`summarizePublishability`
 * (`hasPublishableGtin`/`Price`/`hasImage`) → le mode preview ne peut pas mentir sur ce que le
 * feed live publierait (même classe « source unique » que store_code/honestSalePrice/D3). Pure
 * (pas d'I/O) → testable champ par champ. `opts.allowMissingImage` (tier GTIN-only D2) suit le
 * même contrat que le gate : si l'image n'est pas requise, son absence n'est PAS une cause.
 */
export function classifyFeedRow(
    p: FeedEligibleRow,
    opts: FeedEligibilityOptions = {},
): FeedRowClassification {
    const reasons: FeedBlockReason[] = [];
    if (!hasPublishableGtin(p)) reasons.push("missing_ean");
    if (!hasPublishablePrice(p)) reasons.push("missing_price");
    // L'image n'est un BLOCAGE que si elle est REQUISE (tier GTIN-only OFF). Sous le flag, un
    // produit GTIN+prix sans image EST publié (Google enrichit depuis le GTIN) → pas une cause.
    if (!opts.allowMissingImage && !hasImage(p)) reasons.push("missing_image");
    return { eligible: reasons.length === 0, reasons };
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

export function summarizePublishability(
    rows: FeedEligibleRow[],
    opts: FeedEligibilityOptions = {},
): PublishabilitySummary {
    // PARITÉ avec le gate réel du feed : `summarizePublishability` PRÉDIT `isFeedEligible`, donc il
    // doit honorer le MÊME `allowMissingImage` que les deux filtres de sortie (`feed.ts`/`lfp-xml.ts`
    // passent `gtinOnlyTierEnabled()`). Sinon, flag ON, un produit GTIN+prix SANS image que le feed
    // PUBLIE était compté ici « non publiable » → KPI/readiness sous-évalués = faux « pas prêt » au
    // moment exact du go-live pilote (D2 active ce tier au 1er pilote). Même classe que D3 :
    // « un indicateur qui prédit un gate réutilise le prédicat du gate ». Défaut `false` (image
    // requise) → comportement identique au feed OFF (et aux appels existants qui omettent l'option).
    const allowMissingImage = opts.allowMissingImage === true;

    let publishable = 0;
    let missing_ean = 0;
    let missing_price = 0;
    let missing_image = 0;
    let blocked_only_by_image = 0;

    for (const p of rows) {
        const gtin = hasPublishableGtin(p);
        const price = hasPublishablePrice(p);
        const image = hasImage(p);

        if (gtin && price && (allowMissingImage || image)) {
            publishable++;
            // Tier GTIN-only actif : le produit publie SANS image, mais l'absence d'image reste un
            // fait actionnable (qualité de fiche) → on la compte quand même pour le KPI honnête.
            // Flag OFF : cette branche n'est jamais atteinte sans image (publishable exige l'image),
            // donc `missing_image` garde sa sémantique d'origine (jamais incrémenté ici).
            if (!image) missing_image++;
            continue;
        }
        if (!gtin) missing_ean++;
        if (!price) missing_price++;
        if (!image) missing_image++;
        // « Bloqué SEULEMENT par l'image » n'a de sens que si l'image est REQUISE (flag OFF) :
        // sous le tier GTIN-only un tel produit publie (branche au-dessus) → 0 ici, jamais double-compté.
        if (gtin && price && !image) blocked_only_by_image++;
    }

    const total = rows.length;
    const score = total > 0 ? Math.round((publishable / total) * 100) : 0;
    return { total, publishable, missing_ean, missing_price, missing_image, blocked_only_by_image, score };
}
