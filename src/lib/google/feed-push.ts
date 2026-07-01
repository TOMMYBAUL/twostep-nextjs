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
export function processWithinTimeBudget<T>(
    items: readonly T[],
    action: (item: T) => Promise<boolean>,
    opts: { now: () => number; deadlineMs: number },
): Promise<TimeBudgetResult> {
    // Un tableau matérialisé = une seule « page ». On délègue au moteur streaming pour
    // n'avoir QU'UNE implémentation de la sémantique budget/deadline (parité garantie).
    return processStreamWithinTimeBudget(singlePage(items), action, opts);
}

async function* singlePage<T>(items: readonly T[]): AsyncGenerator<readonly T[]> {
    yield items;
}

/**
 * Variante STREAMING de `processWithinTimeBudget` : consomme des PAGES (un `AsyncIterable`,
 * p. ex. `streamRows`) au lieu d'un tableau matérialisé → mémoire BORNÉE à UNE page.
 *
 * Pourquoi : le cron `google-feed` (Voie A) matérialisait TOUT le catalogue du marchand ET
 * son sous-ensemble éligible en RAM, gardés pendant les ~270 s de push. Un pilote multimarque
 * (Deerskin = des milliers de SKU, cible 50k) n'a pas besoin de ça : on lit, filtre et pousse
 * page par page → une seule page réside à la fois (parité mémoire avec la Voie B XML `streamRows`).
 *
 * Sémantique par-item IDENTIQUE à `processWithinTimeBudget`, à travers toutes les pages :
 * l'horloge est vérifiée AVANT chaque item (un item entamé — un push réseau — est toujours mené
 * à terme), et on rend la main dès le deadline dépassé.
 *
 * ⚠️ HONNÊTETÉ (le streaming borne la MÉMOIRE, PAS le TEMPS) : un catalogue dont le PUSH (N appels
 * réseau séquentiels) dépasse le budget reste `interrupted` → la queue se pousse au run suivant.
 * En interruption, le TOTAL éligible est INCONNU (on cesse de lire les pages restantes) → `attempted`
 * ne compte que les items des pages DÉJÀ lues. BONUS : les pages qu'on ne pourra pas pousser ne sont
 * même pas LUES (on cesse de tirer le générateur dès `interrupted`).
 *
 * ⚠️ FAIL-LOUD : `pages` (p. ex. `streamRows`) LÈVE sur lecture incomplète (erreur / data=null). On
 * ne l'attrape PAS ici → l'exception traverse jusqu'à l'appelant (dans son try/catch), qui écrit un
 * statut "error" (jamais un faux "success" sur un catalogue partiellement lu). Les items DÉJÀ poussés
 * à Google persistent (insert idempotent) et sont re-complétés au run suivant.
 */
export async function processStreamWithinTimeBudget<T>(
    pages: AsyncIterable<readonly T[]>,
    action: (item: T) => Promise<boolean>,
    opts: { now: () => number; deadlineMs: number },
): Promise<TimeBudgetResult> {
    let succeeded = 0;
    let attempted = 0;

    for await (const page of pages) {
        for (const item of page) {
            if (opts.now() >= opts.deadlineMs) {
                return { succeeded, attempted, interrupted: true };
            }
            attempted++;
            if (await action(item)) succeeded++;
        }
    }

    return { succeeded, attempted, interrupted: false };
}
// RÉSIDU DE BUDGET DOCUMENTÉ (F2 revue) : la garde de deadline est PAR-ITEM. Une page qui filtre
// à 0 éligible ne la déclenche pas → son temps de LECTURE DB n'est pas décompté. C'est borné par
// la marge de 30 s entre TIME_BUDGET_MS (270 s) et maxDuration (300 s) = des MILLIERS de fetches de
// page → sûr TANT QUE le nombre de lignes filtrées-SQL par marchand reste sous ~quelques 10k
// (échelle pilote/50k cible OK ; à REVOIR si le catalogue par marchand dépasse ~100k). Une garde
// par-page ne peut pas distinguer « dernière page (fini) » de « pages restantes » sans lire la
// suivante (coût qu'on veut justement borner) → on documente le résidu au lieu d'un check bancal.
