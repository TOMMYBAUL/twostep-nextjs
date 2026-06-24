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
      };

export type ConnectionView =
    | { kind: "error" }
    | { kind: "disconnected" }
    | { kind: "connected"; connection: GoogleConnectionData };

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

    return { kind: "stats", score: s.score, eligible: s.eligible_google, total: s.total_visible, suggestions };
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
