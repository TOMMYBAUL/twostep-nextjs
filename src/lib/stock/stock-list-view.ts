/**
 * Vue dérivée de la liste de stock du marchand (écran « Mon stock » — Phase E, UI honnête).
 *
 * PURE : mappe l'état BRUT du chargement produits (`useProducts`) + le contexte de
 * recherche/filtre vers un modèle de vue DISCRIMINÉ. Testable champ par champ, sans RTL.
 *
 * Raison d'être (honnêteté north-star) : un échec de CHARGEMENT ne doit JAMAIS être
 * affiché comme un faux « catalogue vide ». Avant, `MyStockView` consommait
 * `useProducts()` SANS lire son champ `error` → un 500 / blip DB sur
 * `GET /api/products` laissait `products=[]`, `loading=false` → l'écran rendait
 * l'EmptyState « Aucun produit encore — Ajoutez votre premier produit ».
 * Conséquence pilote : un marchand qui vient d'importer des milliers de SKU voit
 * « vous n'avez aucun produit » sur un simple hoquet réseau, et ré-importe en panique.
 *
 * Même classe que les gardes « lecture qui avale l'erreur » de LESSONS (maillon 5/8,
 * écran Google E1) : un chargement en échec ≠ « 0 produit ». La page doit dire
 * honnêtement « impossible de charger » + offrir un Réessayer, jamais un cul-de-sac.
 */

export type StockListView =
    /** Chargement en cours → squelettes (jamais l'EmptyState prématuré). */
    | { kind: "loading" }
    /** Le chargement a ÉCHOUÉ (HTTP !ok, corps `{error}`, réseau) → erreur honnête + Réessayer. */
    | { kind: "error" }
    /** Chargé OK, des produits matchent le filtre/recherche courant → afficher la liste. */
    | { kind: "list" }
    /** Chargé OK mais 0 produit AU TOTAL (recherche vide) → guider vers l'ajout/import. */
    | { kind: "empty" }
    /** Chargé OK, une recherche est active mais ne renvoie aucun résultat. */
    | { kind: "no-results" };

/**
 * @param state.loading      `true` tant que le fetch est en cours.
 * @param state.loadFailed   `true` si le dernier chargement a échoué (= `error` non null).
 * @param state.filteredCount nombre de produits APRÈS application recherche + filtre.
 * @param state.hasSearch    `true` si une recherche texte est saisie (distingue « vide » de « 0 résultat »).
 */
export function deriveStockListView(state: {
    loading: boolean;
    loadFailed: boolean;
    filteredCount: number;
    hasSearch: boolean;
}): StockListView {
    // `useProducts` remet `error` à null au début de chaque fetch → quand `loading` est
    // vrai, un échec antérieur n'est plus pertinent : montrer les squelettes.
    if (state.loading) return { kind: "loading" };
    // Échec de chargement ≠ « catalogue vide » : ne JAMAIS rendre l'EmptyState « ajoutez
    // votre premier produit » sur un load raté (faux cul-de-sac = re-import en panique).
    if (state.loadFailed) return { kind: "error" };
    if (state.filteredCount > 0) return { kind: "list" };
    // 0 produit affiché : distinguer « rien d'importé » (recherche vide → orienter vers
    // l'import) de « la recherche ne matche rien » (porte de sortie = effacer la recherche).
    if (state.hasSearch) return { kind: "no-results" };
    return { kind: "empty" };
}
