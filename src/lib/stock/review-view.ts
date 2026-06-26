/**
 * Vue dérivée de l'écran « Validation du catalogue enrichi » (review enrichissement —
 * Phase E, UI honnête).
 *
 * PURE : mappe l'état BRUT du chargement serveur (échec de lecture `products` ⟶ `loadError`)
 * + le bucket courant vers un modèle de vue DISCRIMINÉ + les compteurs par bucket. Testable
 * champ par champ, sans RTL.
 *
 * Raison d'être (honnêteté north-star) : un échec de CHARGEMENT ne doit JAMAIS être affiché
 * comme un faux « rien à valider ». Avant, le Server Component `ReviewPage` faisait
 * `const { data: products }` (l'`error` du SELECT JETÉ) → un blip / 500 DB rendait
 * `products=null` → `products ?? []` → `ReviewTable` rendait l'EmptyState
 * « Rien à valider. Connectez un POS… ».
 *
 * Conséquence pilote AGGRAVÉE vs un simple écran vide : les produits `pending_review` sont
 * INVISIBLES dans la vitrine (gate de visibilité 089/094 = zéro faux positif). Un marchand
 * à qui l'écran ment « rien à valider » ne validera JAMAIS ses fiches en attente → son
 * catalogue reste invisible en silence. L'échec de chargement DOIT être dit honnêtement
 * (erreur + Réessayer), jamais transformé en faux « tout est traité ».
 *
 * Même classe que les gardes « lecture qui avale l'erreur » de LESSONS (maillon 5/8, écran
 * Google E1, écran Mon stock E3) : un chargement en échec ≠ « 0 élément ».
 */

export type ReviewBucket = "pending_review" | "validated" | "rejected";

export type ReviewCounts = Record<ReviewBucket, number>;

const BUCKETS: readonly ReviewBucket[] = ["pending_review", "validated", "rejected"];

export type ReviewView<T> =
    /** Le chargement serveur a ÉCHOUÉ (`error` du SELECT products) → erreur honnête + Réessayer. */
    | { kind: "error" }
    /**
     * Chargé OK. `counts` = total par bucket (toujours affiché dans les onglets) ;
     * `filtered` = produits du bucket courant (vide → le composant rend l'EmptyState
     * propre au bucket, qui n'est PLUS ambigu avec un échec de chargement).
     */
    | { kind: "ready"; counts: ReviewCounts; filtered: T[] };

/**
 * @param input.loadError `true` si le SELECT products côté serveur a renvoyé une erreur
 *                        (≠ « 0 produit à valider »). Source unique d'honnêteté de l'écran.
 * @param input.products  produits enrichis chargés (déjà filtrés `enrichment_source != null`).
 * @param input.bucket    onglet courant (état client de `ReviewTable`).
 */
export function deriveReviewView<T extends { review_status: ReviewBucket }>(input: {
    loadError: boolean;
    products: T[];
    bucket: ReviewBucket;
}): ReviewView<T> {
    // Échec de chargement ≠ « rien à valider » : ne JAMAIS rendre un EmptyState rassurant
    // sur un load raté (faux « tout est traité » → fiches pending jamais validées = vitrine
    // muette). Prioritaire sur tout le reste.
    if (input.loadError) return { kind: "error" };

    const counts: ReviewCounts = { pending_review: 0, validated: 0, rejected: 0 };
    for (const p of input.products) {
        // Garde : ne compter que les buckets connus (un éventuel `pending`/`masked` du gate
        // cascade ne doit pas produire un compteur `NaN`/fantôme).
        if (p.review_status in counts) counts[p.review_status]++;
    }

    const filtered = input.products.filter((p) => p.review_status === input.bucket);
    return { kind: "ready", counts, filtered };
}

export { BUCKETS as REVIEW_BUCKETS };
