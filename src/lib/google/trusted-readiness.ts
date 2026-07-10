/**
 * Dossier « Trusted » Google LFP — la question « a-t-on 5 marchands vérifiés ? » rendue
 * PROGRAMMATIQUE et TESTABLE (item P1-5 « dossier Trusted » de `docs/autonomy-priorities.md`).
 *
 * Le statut Trusted exige 5 marchands vérifiés, chacun avec : Business Profile vérifié + lié au
 * Merchant Center, > 11 offres publiables, feed quotidien (cf. mails Google avril 2026,
 * `docs/prospection/google-lfp-preparation-v2.md`). Ce module agrège, PAR marchand :
 *  - les signaux OBSERVABLES par la boucle : offres publiables + connexion Google (via
 *    `evaluateFeedReadiness` — source unique anti-dérive, on ne ré-évalue rien ici) et la
 *    fraîcheur du feed (`google_merchant_connections.last_feed_at` / `last_feed_status`) ;
 *  - les prérequis EXTERNES non observables côté code (GBP vérifié, GBP lié au MC, « Request
 *    inventory verification » cliqué) : fournis en ATTESTATIONS que Thomas coche —
 *    fail-closed, jamais devinés.
 *
 * Sémantique « feed quotidien » (vérifiée dans `cron/google-feed/route.ts`) : `last_feed_at`
 * est l'heure de la TENTATIVE, écrite quel que soit le statut → un push 'error'/'partial' frais
 * n'est PAS un feed quotidien sain. Le check exige `last_feed_status === "success"` ET un âge
 * ≤ `DAILY_FEED_MAX_AGE_HOURS`.
 */

import {
    evaluateFeedReadiness,
    type FeedReadinessBlocker,
    type FeedReadinessResult,
} from "./pilot-readiness";

/** Nombre de marchands vérifiés exigé par Google pour le statut Trusted. */
export const TRUSTED_MIN_VERIFIED_MERCHANTS = 5;

/**
 * Fenêtre de fraîcheur du « feed quotidien » : cadence quotidienne (24 h) + 6 h de marge
 * (décalage de cron / fenêtre de maintenance). Au-delà, le feed n'est plus « quotidien ».
 */
export const DAILY_FEED_MAX_AGE_HOURS = 30;

/**
 * Tolérance de skew d'horloge pour un `last_feed_at` FUTUR. Un skew de quelques minutes entre
 * Vercel et l'appelant est normal ; au-delà, le timestamp est une donnée CORROMPUE (bug d'unité,
 * backfill raté) et vaut blocker `feed_timestamp_invalid` — jamais « frais » (revue SF-hunter
 * 2026-07-10 : sans borne, un `success` daté +1 an resterait « quotidien » indéfiniment).
 */
export const FUTURE_SKEW_TOLERANCE_MS = 15 * 60_000;

export type TrustedBlocker =
    | FeedReadinessBlocker
    | "feed_never_pushed"
    | "last_feed_not_success"
    | "feed_not_daily"
    | "feed_timestamp_invalid"
    | "gbp_not_verified"
    | "gbp_not_linked_to_mc"
    | "inventory_verification_not_requested";

/** Prérequis externes attestés par un humain (non observables côté boucle). */
export interface TrustedAttestations {
    /** Business Profile du marchand vérifié par Google. */
    gbpVerified: boolean;
    /** Business Profile LIÉ au compte Merchant Center. */
    gbpLinkedToMc: boolean;
    /** « Request inventory verification » demandé dans le Merchant Center. */
    inventoryVerificationRequested: boolean;
}

export interface TrustedMerchantInput {
    merchantId: string;
    name: string;
    /** = `summarizePublishability(...).publishable` (vrai gate du feed), jamais un proxy. */
    publishable: number;
    /** Connexion `google_merchant_connections` active. */
    googleConnected: boolean;
    /** `google_merchant_connections.last_feed_at` (heure de la DERNIÈRE TENTATIVE). */
    lastFeedAt: string | null;
    /** `google_merchant_connections.last_feed_status` ('pending'|'success'|'partial'|'error'). */
    lastFeedStatus: string | null;
    attested: TrustedAttestations;
}

export interface TrustedMerchantResult {
    merchantId: string;
    name: string;
    /** Readiness software du feed (source unique `evaluateFeedReadiness`). */
    feed: FeedReadinessResult;
    /** Dernier push = 'success' ET âge ≤ fenêtre quotidienne. */
    dailyFeedOk: boolean;
    /** Attestations normalisées (fail-closed : tout non-`true` devient `false`). */
    attested: TrustedAttestations;
    /** Causes de non-prêt, ordre stable : offres → connexion → feed → attestations. */
    blockers: TrustedBlocker[];
    trustedReady: boolean;
}

export interface TrustedDossierResult {
    /** Un résultat par marchand UNIQUE (doublons de merchantId dédupliqués, le PIRE gagne). */
    merchants: TrustedMerchantResult[];
    readyCount: number;
    threshold: number;
    /** Marchands prêts manquants pour Trusted (0 si atteint, jamais négatif). */
    shortfall: number;
    trustedEligible: boolean;
}

/**
 * Fraîcheur du feed en EPOCH (LESSON : PostgREST rend « +00:00 » → jamais de comparaison de
 * chaînes). Fail-closed sur les deux bords : timestamp illisible OU futur au-delà de la
 * tolérance de skew → `invalid` (donnée corrompue ≠ « pas encore l'heure »). Skew futur léger
 * → toléré (âge ≡ 0).
 */
function classifyFeedFreshness(lastFeedAt: string, nowMs: number): "fresh" | "stale" | "invalid" {
    const t = Date.parse(lastFeedAt);
    if (!Number.isFinite(t)) return "invalid";
    if (t - nowMs > FUTURE_SKEW_TOLERANCE_MS) return "invalid";
    const ageMs = Math.max(0, nowMs - t);
    return ageMs <= DAILY_FEED_MAX_AGE_HOURS * 3_600_000 ? "fresh" : "stale";
}

/**
 * Évalue la readiness Trusted d'UN marchand. Pure (horloge injectée) → testable champ par champ.
 */
export function evaluateTrustedMerchant(
    input: TrustedMerchantInput,
    nowMs: number,
): TrustedMerchantResult {
    const feed = evaluateFeedReadiness({
        publishable: input.publishable,
        googleConnected: input.googleConnected,
    });

    // Attestations fail-closed : une valeur sale (string, undefined…) ne vaut JAMAIS « attesté ».
    const attested: TrustedAttestations = {
        gbpVerified: input.attested?.gbpVerified === true,
        gbpLinkedToMc: input.attested?.gbpLinkedToMc === true,
        inventoryVerificationRequested: input.attested?.inventoryVerificationRequested === true,
    };

    const blockers: TrustedBlocker[] = [...feed.blockers];

    let dailyFeedOk = false;
    const hasFeedTimestamp = typeof input.lastFeedAt === "string" && input.lastFeedAt !== "";
    if (!hasFeedTimestamp) {
        // Jamais poussé : un seul blocker (pas de double peine avec le statut 'pending').
        blockers.push("feed_never_pushed");
    } else {
        const freshness = classifyFeedFreshness(input.lastFeedAt as string, nowMs);
        const success = input.lastFeedStatus === "success";
        if (!success) blockers.push("last_feed_not_success");
        if (freshness === "stale") blockers.push("feed_not_daily");
        if (freshness === "invalid") blockers.push("feed_timestamp_invalid");
        dailyFeedOk = freshness === "fresh" && success;
    }

    if (!attested.gbpVerified) blockers.push("gbp_not_verified");
    if (!attested.gbpLinkedToMc) blockers.push("gbp_not_linked_to_mc");
    if (!attested.inventoryVerificationRequested) blockers.push("inventory_verification_not_requested");

    return {
        merchantId: input.merchantId,
        name: input.name,
        feed,
        dailyFeedOk,
        attested,
        blockers,
        trustedReady: blockers.length === 0,
    };
}

/**
 * Roll-up du dossier Trusted : X/5 marchands prêts. Déduplique par `merchantId` en gardant le
 * PIRE état (le plus de blockers ; premier à égalité) — un doublon d'entrée divergent (ex. une
 * jointure qui remonte une connexion périmée « prête » ET l'état réel cassé) ne doit JAMAIS
 * gonfler le compte vers le seuil (un KPI qui surévalue = faux positif, la classe d'erreur
 * interdite par le north-star ; revue SF-hunter 2026-07-10 : « premier gagne » laissait passer
 * un doublon périmé favorable).
 */
export function evaluateTrustedDossier(
    inputs: TrustedMerchantInput[],
    nowMs: number,
): TrustedDossierResult {
    const byMerchant = new Map<string, TrustedMerchantResult>();
    const order: string[] = [];
    for (const input of inputs) {
        const result = evaluateTrustedMerchant(input, nowMs);
        const existing = byMerchant.get(input.merchantId);
        if (!existing) {
            byMerchant.set(input.merchantId, result);
            order.push(input.merchantId);
        } else if (result.blockers.length > existing.blockers.length) {
            byMerchant.set(input.merchantId, result);
        }
    }
    const merchants = order.map((id) => byMerchant.get(id)!);

    const readyCount = merchants.filter((m) => m.trustedReady).length;
    const shortfall = Math.max(0, TRUSTED_MIN_VERIFIED_MERCHANTS - readyCount);

    return {
        merchants,
        readyCount,
        threshold: TRUSTED_MIN_VERIFIED_MERCHANTS,
        shortfall,
        trustedEligible: readyCount >= TRUSTED_MIN_VERIFIED_MERCHANTS,
    };
}
