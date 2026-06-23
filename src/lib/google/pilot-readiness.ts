/**
 * Pilot-readiness Google LFP — la question « ce marchand est-il prêt pour le feed LFP ? »
 * rendue PROGRAMMATIQUE et TESTABLE (item READINESS du backlog : `docs/autonomy-priorities.md`).
 *
 * Pourquoi ce module existe : le seuil LFP « ≥ 11 offres publiables » ne vivait QUE dans la prose
 * (`docs/prospection/google-lfp-preparation-v2.md` : « 11+ GTIN par merchant », « Trusted threshold »).
 * Le dashboard Google affichait un compte brut (`X / Y produits éligibles`) + un score %, mais
 * rien ne disait au marchand / à Thomas « il vous manque K offres pour atteindre le seuil LFP ».
 * La checklist go-live a besoin d'un signal VÉRIFIABLE, pas d'un comptage manuel.
 *
 * Source unique anti-dérive : `publishable` DOIT provenir de `summarizePublishability`
 * (`feed-eligibility.ts`), qui réutilise le VRAI gate du feed (`isFeedEligible`). On ne ré-évalue
 * PAS l'éligibilité ici — sinon ce KPI pourrait surévaluer (compter comme « offre » un produit que
 * le feed rejette en silence : prix 0 / image vide / GTIN tronqué). Même classe que D3
 * (store_code / honestSalePrice) : un indicateur qui prédit un gate réutilise le prédicat du gate.
 */

/**
 * Seuil minimal d'offres publiables exigé par Google pour un compte LFP.
 *
 * Google LFP requiert un minimum de 11 produits valides (avec GTIN) par marchand inscrit avant la
 * vérification en magasin / le statut Trusted. Documenté côté produit dans
 * `docs/prospection/google-lfp-preparation-v2.md` (table « Trusted threshold : 11+ GTIN par merchant »).
 * UNE seule définition de ce nombre dans tout le code (grep `LFP_MIN_PUBLISHABLE_OFFERS`).
 */
export const LFP_MIN_PUBLISHABLE_OFFERS = 11;

/**
 * Codes de blocage stables (machine-readable) — la checklist go-live et le dashboard mappent ces
 * codes vers un libellé. Stables (pas des libellés d'affichage) pour ne pas casser un consommateur
 * quand le texte FR change.
 */
export type FeedReadinessBlocker = "below_offer_threshold" | "google_not_connected";

export interface FeedReadinessInput {
    /**
     * Nombre de produits RÉELLEMENT publiables (= `summarizePublishability(...).publishable`,
     * qui passe `isFeedEligible`). NE PAS passer `total_visible` ni un proxy `ean && price`.
     */
    publishable: number;
    /** Le marchand a-t-il une connexion Google Merchant active (`google_merchant_connections`) ? */
    googleConnected: boolean;
}

export interface FeedReadinessResult {
    /** Nombre d'offres publiables (recopié de l'entrée, pour un payload self-contained). */
    publishable: number;
    /** Seuil LFP (`LFP_MIN_PUBLISHABLE_OFFERS`). */
    threshold: number;
    /** `publishable >= threshold`. */
    meetsOfferThreshold: boolean;
    /** Combien d'offres manquent pour atteindre le seuil (0 si déjà atteint, jamais négatif). */
    offerShortfall: number;
    /** Le marchand est-il connecté à Google Merchant ? (recopié de l'entrée.) */
    googleConnected: boolean;
    /**
     * Prêt pour le feed LFP côté SOFTWARE = seuil d'offres atteint ET connecté à Google.
     * NB : ne couvre PAS les prérequis EXTERNES (Business Profile vérifié + lié au MC,
     * « Request inventory verification » cliqué dans Google MC) — ceux-là ne sont pas
     * observables côté boucle et vivent dans la checklist go-live.
     */
    feedReady: boolean;
    /** Causes de non-prêt (vide si `feedReady`). Ordre stable : offres puis connexion. */
    blockers: FeedReadinessBlocker[];
}

/**
 * Évalue la readiness SOFTWARE du feed LFP d'un marchand à partir de signaux observables.
 *
 * Pure (pas d'I/O) → testable champ par champ. Le caller (route `/api/google/stats`) fournit
 * `publishable` depuis `summarizePublishability` et l'état de connexion depuis
 * `google_merchant_connections`.
 */
export function evaluateFeedReadiness(input: FeedReadinessInput): FeedReadinessResult {
    // Garde défensive : un compte d'offres négatif/NaN est un bug appelant, pas « 0 offre ».
    // On le normalise à 0 (jamais publiable) plutôt que de propager une valeur absurde dans le %.
    const publishable = Number.isFinite(input.publishable) && input.publishable > 0
        ? Math.floor(input.publishable)
        : 0;

    const meetsOfferThreshold = publishable >= LFP_MIN_PUBLISHABLE_OFFERS;
    const offerShortfall = meetsOfferThreshold ? 0 : LFP_MIN_PUBLISHABLE_OFFERS - publishable;
    const googleConnected = input.googleConnected === true;

    const blockers: FeedReadinessBlocker[] = [];
    if (!meetsOfferThreshold) blockers.push("below_offer_threshold");
    if (!googleConnected) blockers.push("google_not_connected");

    return {
        publishable,
        threshold: LFP_MIN_PUBLISHABLE_OFFERS,
        meetsOfferThreshold,
        offerShortfall,
        googleConnected,
        feedReady: blockers.length === 0,
        blockers,
    };
}
