/**
 * SCALE / VOLUME — éviter la troncature SILENCIEUSE du feed Google sur gros catalogue
 * (priorities §1bis item #4 : « timeouts crons/routes Vercel sur gros catalogues »).
 *
 * Le cron `google-feed` (Voie A) pousse les produits éligibles d'un marchand UN PAR UN
 * via un appel réseau SÉQUENTIEL (`productInputs:insert`). Sur un catalogue pilote
 * multimarque (Deerskin = des MILLIERS de SKU), N appels × ~100-300 ms peut dépasser le
 * budget d'exécution Vercel → la fonction est TUÉE en plein vol :
 *  - les produits déjà poussés le sont, le reste est OMIS (feed partiel) ;
 *  - PIRE : l'écriture du statut (`last_feed_status`) en fin de boucle ne s'exécute
 *    JAMAIS → le marchand reste sur le « success » du run précédent = troncature
 *    SILENCIEUSE (aucun statut « partial », aucun Sentry). C'est la perte n°1.
 *
 * Ce helper borne le travail à un DEADLINE absolu : il s'arrête PROPREMENT avant le kill
 * Vercel et SIGNALE `interrupted` → l'appelant écrit un statut HONNÊTE (« partial,
 * interrompu : X/Y poussés ») au lieu de se faire tuer en silence. Pur (horloge + action
 * injectées, aucune dépendance réseau/DB) → déterministe, testable sans réseau ni horloge
 * réelle. north-star : « ne rien perdre silencieusement — impossible sans alerte ».
 */

export interface TimeBudgetResult {
    /** Produits dont l'action a RÉUSSI (`action` a renvoyé true). */
    succeeded: number;
    /**
     * Produits TENTÉS ce run (réussite + échec capturé). Strictement inférieur à
     * `items.length` lorsque `interrupted` est vrai (le reste n'a pas été tenté).
     */
    attempted: number;
    /** true si le deadline a coupé la boucle AVANT d'avoir tenté tous les items. */
    interrupted: boolean;
}

/**
 * Itère `items` et exécute `action` sur chacun TANT QUE le deadline n'est pas atteint.
 *
 * - `action(item)` renvoie `true` si l'item a réussi ; l'appelant CAPTURE ses propres
 *   erreurs (Sentry par item) et renvoie `false` — on ne masque rien ici.
 * - L'horloge est vérifiée AVANT de commencer chaque item : un item entamé est toujours
 *   mené à terme (jamais d'écriture réseau coupée en deux), et on s'arrête net dès que le
 *   budget est dépassé plutôt que d'attendre le kill brutal de Vercel.
 *
 * `items` vide → `{ succeeded: 0, attempted: 0, interrupted: false }` (rien à faire ≠
 * interruption). Deadline déjà passé sur une liste non vide → `attempted: 0,
 * interrupted: true` (l'appelant doit signaler le marchand non traité, jamais « success »).
 */
export async function processWithinTimeBudget<T>(
    items: readonly T[],
    action: (item: T) => Promise<boolean>,
    opts: { now: () => number; deadlineMs: number },
): Promise<TimeBudgetResult> {
    let succeeded = 0;
    let attempted = 0;

    for (const item of items) {
        if (opts.now() >= opts.deadlineMs) {
            return { succeeded, attempted, interrupted: true };
        }
        attempted++;
        if (await action(item)) succeeded++;
    }

    return { succeeded, attempted, interrupted: false };
}
