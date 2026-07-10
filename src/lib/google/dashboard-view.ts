/**
 * Vue dérivée de la page Google du dashboard marchand (Phase E — UI honnête + idiotproof).
 *
 * PURE : mappe les résultats BRUTS des deux chargements (stats `/api/google/stats` +
 * lecture connexion `google_merchant_connections`) vers un modèle de vue DISCRIMINÉ.
 *
 * Raison d'être (honnêteté north-star) : un échec de CHARGEMENT ne doit JAMAIS être
 * affiché comme un état faussement OK. Avant, la page :
 *  - ignorait le statut HTTP de `/api/google/stats` → un 500 `{error:"db_error"}` faisait
 *    disparaître le score en SILENCE (le marchand voyait « tout va bien, connecte Google »);
 *  - jetait l'`error` de la lecture connexion → un blip DB affichait faussement
 *    « pas connecté » et invitait à (re)connecter une boutique déjà connectée.
 * Même classe que les gardes « lecture qui avale l'erreur » de LESSONS (maillon 5/8) :
 * une lecture en échec ≠ « 0 produit » / « pas connecté ».
 */

export type GoogleStatsData = {
    total_visible: number;
    eligible_google: number;
    missing_ean: number;
    missing_photo: number;
    missing_price: number;
    score: number;
    // Readiness LFP (déjà calculée par `/api/google/stats` via `evaluateFeedReadiness`, mais
    // jamais affichée au marchand jusqu'ici) : le signal go-live « êtes-vous prêt à publier
    // sur Google LFP ? ». Source de vérité serveur = `lfp_feed_ready` (seuil d'offres ATTEINT
    // ET connecté). Les autres champs servent à GUIDER (combien d'offres manquantes, etc.).
    blocked_only_by_image: number;
    lfp_offers_threshold: number;
    lfp_meets_offer_threshold: boolean;
    lfp_offer_shortfall: number;
    google_connected: boolean;
    lfp_feed_ready: boolean;
    // SLA fraîcheur G1 (champs ADDITIFS de /api/google/stats — optionnels pour ne pas
    // casser un payload d'ancienne version : absents → la tuile fraîcheur ne s'affiche pas).
    in_stock?: number;
    publishable_in_stock?: number;
    fresh_available?: number;
    freshness_score?: number;
};

export type GoogleConnectionData = {
    google_merchant_id: string;
    products_pushed: number;
    last_feed_at: string | null;
    last_feed_status: string;
    last_feed_error: string | null;
    store_code: string;
};

export type StatsSuggestion = { count: number; label: string; tone: "warning" | "error" };

/**
 * SLA fraîcheur (G1) affichable : parmi les offres publiables EN STOCK, combien seraient
 * affichées « Disponible » (source caisse récente + quantité saine). `null` quand le serveur
 * ne fournit pas les champs (ancienne version) → la tuile ne s'affiche pas (jamais un 0 % inventé).
 */
export type StatsFreshness = {
    /** % d'offres fraîches parmi les publiables en stock (0-100). */
    score: number;
    /** Numérateur : offres publiables en stock affichées « Disponible ». */
    fresh: number;
    /** Dénominateur : offres publiables avec quantité > 0. */
    publishableInStock: number;
};

export type StatsView =
    /** Un chargement a échoué (HTTP !ok, corps `{error}`, réseau) → erreur honnête, pas un faux « vide ». */
    | { kind: "error" }
    /** Chargé OK mais 0 produit visible → guider vers l'import de stock (zéro cul-de-sac). */
    | { kind: "empty" }
    /** Chargé OK avec des produits → score + suggestions actionnables. */
    | {
          kind: "stats";
          score: number;
          eligible: number;
          total: number;
          suggestions: StatsSuggestion[];
          freshness: StatsFreshness | null;
      };

export type ConnectionView =
    | { kind: "error" }
    | { kind: "disconnected" }
    | { kind: "connected"; connection: GoogleConnectionData };

/** Un frein à la readiness LFP, avec un code stable + un libellé + un conseil actionnable. */
export type ReadinessBlocker = {
    code: "below_offer_threshold" | "google_not_connected";
    label: string;
    /** Conseil actionnable supplémentaire (ex. « K produits ne manquent que d'une photo »). */
    hint?: string;
};

export type ReadinessView =
    /** Stats non chargées OK, ou catalogue vide → la readiness n'ajoute rien (les cartes
     *  « erreur » / « importer mon stock » guident déjà — pas de double message). */
    | { kind: "hidden" }
    /** Seuil d'offres atteint ET connecté → prêt pour le feed LFP (le signal go-live).
     *  `publishable` = nombre d'offres publiables, ou `null` si le serveur ne l'a pas fourni
     *  (incohérence : `lfp_feed_ready=true` mais `eligible_google` absent/0) → ne pas afficher
     *  un trompeur « Vos 0 offres publiables dépassent le seuil ». */
    | { kind: "ready"; publishable: number | null }
    /** Pas encore prêt → ce qu'il reste à faire, sans cul-de-sac. */
    | { kind: "blocked"; blockers: ReadinessBlocker[] };

const plural = (n: number): string => (n > 1 ? "s" : "");

/**
 * Vue de la readiness LFP (« êtes-vous prêt à publier sur Google LFP ? ») dérivée du MÊME
 * payload `/api/google/stats`. Pure → testable champ par champ.
 *
 * Honnêteté (north-star) : on ne RECALCULE pas la readiness côté client — `lfp_feed_ready`
 * est la source de vérité serveur (`evaluateFeedReadiness`, qui réutilise le vrai gate du
 * feed). On ne fait que MAPPER ce verdict + les compteurs vers un message actionnable.
 * @param load.ok    `false` si le fetch a échoué (l'état « error » est rendu par deriveStatsView).
 * @param load.stats le corps parsé quand `ok` ; sinon `null`.
 */
export function deriveReadinessView(load: { ok: boolean; stats: GoogleStatsData | null }): ReadinessView {
    if (!load.ok || !load.stats) return { kind: "hidden" };
    const s = load.stats;
    // Catalogue vide : deriveStatsView renvoie déjà « empty » avec le CTA d'import → ne pas
    // doubler avec un « pas prêt » redondant.
    if (!(s.total_visible > 0)) return { kind: "hidden" };

    // `lfp_feed_ready` = verdict serveur (seuil ATTEINT ET connecté). On lui fait confiance
    // pour la décision prêt/pas-prêt (pas de 2ᵉ logique de readiness côté client = anti-dérive).
    if (s.lfp_feed_ready === true) {
        const publishable = Number.isFinite(s.eligible_google) && s.eligible_google > 0 ? Math.floor(s.eligible_google) : null;
        return { kind: "ready", publishable };
    }

    // Pas prêt → expliciter CHAQUE frein (ordre stable : offres puis connexion).
    const blockers: ReadinessBlocker[] = [];

    if (s.lfp_meets_offer_threshold !== true) {
        const shortfall = Number.isFinite(s.lfp_offer_shortfall) && s.lfp_offer_shortfall > 0 ? Math.floor(s.lfp_offer_shortfall) : 0;
        const threshold = Number.isFinite(s.lfp_offers_threshold) && s.lfp_offers_threshold > 0 ? Math.floor(s.lfp_offers_threshold) : 0;
        const blockedByImage = Number.isFinite(s.blocked_only_by_image) && s.blocked_only_by_image > 0 ? Math.floor(s.blocked_only_by_image) : 0;
        blockers.push({
            code: "below_offer_threshold",
            label:
                shortfall > 0
                    ? `Il vous manque ${shortfall} offre${plural(shortfall)} publiable${plural(shortfall)} pour atteindre le seuil Google LFP (${threshold}).`
                    : `Vous devez atteindre le seuil Google LFP (${threshold} offres publiables).`,
            // `blocked_only_by_image` = produits éligibles à tout SAUF la photo → le levier le plus
            // rapide pour gagner des offres (cf. KPI D3 `blocked_only_by_image`).
            hint:
                blockedByImage > 0
                    ? `${blockedByImage} produit${plural(blockedByImage)} ${blockedByImage > 1 ? "ne manquent" : "ne manque"} que d'une photo pour devenir publiable${plural(blockedByImage)}.`
                    : undefined,
        });
    }

    if (s.google_connected !== true) {
        blockers.push({
            code: "google_not_connected",
            label: "Connectez votre boutique à Google pour publier vos offres (voir ci-dessous).",
        });
    }

    // Garde défensive : `lfp_feed_ready=false` SANS frein identifié = contrat serveur incohérent
    // (feed_ready ⟺ seuil ATTEINT ET connecté). Ne pas afficher une carte « pas prêt » vide.
    if (blockers.length === 0) {
        const threshold = Number.isFinite(s.lfp_offers_threshold) && s.lfp_offers_threshold > 0 ? Math.floor(s.lfp_offers_threshold) : 0;
        blockers.push({
            code: "below_offer_threshold",
            label: `Vous devez atteindre le seuil Google LFP (${threshold} offres publiables).`,
        });
    }

    return { kind: "blocked", blockers };
}

/**
 * @param load.ok    `false` si le fetch a échoué (statut HTTP non-2xx, corps `{error}`, réseau).
 * @param load.stats le corps parsé quand `ok` ; sinon `null`.
 */
export function deriveStatsView(load: { ok: boolean; stats: GoogleStatsData | null }): StatsView {
    // Échec de chargement ≠ « catalogue vide » : ne pas afficher un faux 0 % / 0 produit.
    if (!load.ok || !load.stats) return { kind: "error" };

    const s = load.stats;
    // Pas encore de produit visible : le marchand n'a probablement rien importé → on l'oriente,
    // plutôt que d'afficher un score vide sans porte de sortie.
    if (s.total_visible <= 0) return { kind: "empty" };

    const suggestions: StatsSuggestion[] = [];
    if (s.missing_photo > 0)
        suggestions.push({ count: s.missing_photo, label: "produits sans photo — ajoutez une photo pour les rendre visibles", tone: "warning" });
    if (s.missing_ean > 0)
        suggestions.push({ count: s.missing_ean, label: "produits sans code-barres — complétez-les dans votre caisse", tone: "error" });
    if (s.missing_price > 0)
        suggestions.push({ count: s.missing_price, label: "produits sans prix — ajoutez un prix pour les rendre visibles", tone: "warning" });

    // SLA fraîcheur : uniquement si le serveur a FOURNI les 3 champs (nombres finis).
    // Champs absents/invalides → null (pas de tuile), jamais un « 0 % frais » inventé.
    const freshness: StatsFreshness | null =
        Number.isFinite(s.freshness_score) && Number.isFinite(s.fresh_available) && Number.isFinite(s.publishable_in_stock)
            ? {
                  score: s.freshness_score as number,
                  fresh: s.fresh_available as number,
                  publishableInStock: s.publishable_in_stock as number,
              }
            : null;

    return { kind: "stats", score: s.score, eligible: s.eligible_google, total: s.total_visible, suggestions, freshness };
}

/** Une journée d'historique SLA (ligne `merchant_sla_history`, servie par `/api/google/sla-history`). */
export type SlaHistoryDay = {
    day: string;
    total: number;
    publishable: number;
    publishable_score: number;
    in_stock: number;
    publishable_in_stock: number;
    fresh_available: number;
    freshness_score: number;
};

export type SlaHistoryView =
    /** Le fetch a échoué (HTTP !ok, réseau) → erreur honnête, jamais un faux « pas d'historique ». */
    | { kind: "error" }
    /** 200 `available:false` = migration/flag pas encore actifs → « bientôt », PAS « vide ». */
    | { kind: "unavailable" }
    /** Historique actif mais encore aucune journée écrite (flag posé aujourd'hui). */
    | { kind: "empty" }
    /** Jusqu'à 7 jours, du plus récent au plus ancien (ordre serveur conservé). */
    | { kind: "history"; days: SlaHistoryDay[] };

/**
 * Vue de l'historique SLA 7 jours (G1). Pure — 4 états DISTINCTS : une erreur de chargement,
 * une feature pas encore activée et un historique réellement vide sont trois choses
 * différentes ; les confondre = exactement le mensonge que la Phase E interdit.
 * @param load.ok   `false` si le fetch a échoué (statut HTTP non-2xx, corps `{error}`, réseau).
 * @param load.body le corps parsé quand `ok` ; sinon `null`.
 */
export function deriveSlaHistoryView(load: {
    ok: boolean;
    body: { available?: boolean; days?: SlaHistoryDay[] } | null;
}): SlaHistoryView {
    if (!load.ok || !load.body) return { kind: "error" };
    if (load.body.available !== true) return { kind: "unavailable" };
    const days = Array.isArray(load.body.days) ? load.body.days : [];
    if (days.length === 0) return { kind: "empty" };
    return { kind: "history", days: days.slice(0, 7) };
}

/**
 * @param load.error `true` si la lecture connexion a échoué (≠ « pas connecté »).
 * @param load.connection la ligne quand présente ; `null` = vraiment pas connecté.
 */
export function deriveConnectionView(load: { error: boolean; connection: GoogleConnectionData | null }): ConnectionView {
    // Un échec de lecture ≠ « pas connecté » : ne pas inviter à (re)connecter sur un blip DB.
    if (load.error) return { kind: "error" };
    if (!load.connection) return { kind: "disconnected" };
    return { kind: "connected", connection: load.connection };
}
