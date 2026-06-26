/**
 * Vue dérivée de l'écran « Synchronisation POS » (connexion caisse — Phase E, UI honnête).
 *
 * PURE : mappe l'état BRUT des 3 lectures serveur (marchand / connexion POS / nombre de
 * produits suivis) vers un modèle de vue DISCRIMINÉ. Testable champ par champ, sans RTL.
 *
 * Raison d'être (honnêteté north-star) : c'est la moitié « connexion » de l'onboarding du
 * marchand pilote. Le Server Component `DashboardPosPage` faisait `const { data: merchant }`
 * et `const { data: connection }` (les `error` des SELECT JETÉS) → deux faux positifs
 * d'affichage réels sur un simple blip / 500 DB :
 *
 *   1. Lecture marchand en échec → `merchant = null` (indistinct de « pas de marchand ») →
 *      `redirect("/devenir-marchand")` → un marchand DÉJÀ onboardé est éjecté vers
 *      « devenir marchand » sur un hoquet DB = pire faux négatif (perte d'accès apparente).
 *   2. Lecture connexion en échec → `connection = null` → `hasConnection = false` → l'écran
 *      affiche « Aucune caisse connectée » à un marchand qui EST connecté → il re-connecte
 *      (doublon / confusion). Exactement la classe du finding E1 (faux « pas connecté » sur blip).
 *
 * Règle (LESSONS, maillon 5/8 + écrans Google E1 / Mon stock E3 / Validation E4) : un
 * chargement en échec ≠ « absent / 0 ». On le DIT (erreur honnête + Réessayer), on ne le
 * masque jamais en un état rassurant ou en une redirection silencieuse.
 */

export interface PosConnectionRow {
    provider: string | null;
    last_sync_at: string | null;
    last_sync_status: string | null;
    last_sync_error: string | null;
    expires_at: string | null;
}

export type PosConnectionView =
    /**
     * Une lecture d'aiguillage a ÉCHOUÉ (marchand ou connexion) → erreur honnête + Réessayer.
     * On NE redirige PAS et on N'affiche PAS « aucune caisse » : un blip ne doit ni éjecter
     * le marchand ni mentir sur l'état de connexion.
     */
    | { kind: "error" }
    /** Marchand réellement absent (lecture OK, 0 ligne) → la page redirige vers l'onboarding. */
    | { kind: "no-merchant" }
    /**
     * Chargé. `hasConnection` distingue « caisse connectée » de « aucune » de façon FIABLE
     * (lecture réussie). `productsCount` = nombre de produits suivis, ou `null` si SA lecture
     * a échoué (non bloquant — détail d'affichage dans la carte connectée) → la page rend
     * « — » plutôt qu'un faux « 0 ».
     */
    | {
          kind: "ready";
          hasConnection: boolean;
          connection: PosConnectionRow | null;
          productsCount: number | null;
      };

/**
 * @param input.merchantFailed      `true` si le SELECT merchants a renvoyé une erreur (≠ 0 ligne).
 * @param input.hasMerchant         `true` si une ligne marchand existe (lecture réussie).
 * @param input.connectionFailed    `true` si le SELECT pos_connections a renvoyé une erreur.
 * @param input.connection          ligne de connexion POS (ou `null` si aucune).
 * @param input.productsCountFailed `true` si le count produits a renvoyé une erreur (non bloquant).
 * @param input.productsCount       nombre de produits suivis (ou `null`).
 */
export function derivePosConnectionView(input: {
    merchantFailed: boolean;
    hasMerchant: boolean;
    connectionFailed: boolean;
    connection: PosConnectionRow | null;
    productsCountFailed: boolean;
    productsCount: number | null;
}): PosConnectionView {
    // 1. Lecture marchand en échec : ne JAMAIS rediriger (éjecterait un marchand onboardé sur
    //    un blip). Prioritaire : sans marchand fiable, le reste de l'écran n'a pas de sens.
    if (input.merchantFailed) return { kind: "error" };

    // 2. Marchand réellement absent (lecture OK) → onboarding légitime.
    if (!input.hasMerchant) return { kind: "no-merchant" };

    // 3. Lecture connexion en échec : ne JAMAIS afficher « aucune caisse » (ferait re-connecter
    //    un marchand déjà connecté = doublon). Erreur honnête.
    if (input.connectionFailed) return { kind: "error" };

    return {
        kind: "ready",
        hasConnection: input.connection !== null,
        connection: input.connection,
        // Échec du count ≠ « 0 produit suivi » : rendre l'inconnu (`null` → « — »), pas un faux 0.
        productsCount: input.productsCountFailed ? null : input.productsCount,
    };
}
