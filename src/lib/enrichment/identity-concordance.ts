import { scoreNameMatch } from "@/lib/ean/lookup";

/**
 * Seuil de concordance nom-marchand ↔ nom-résolu-par-EAN (`scoreNameMatch`, 0..1).
 *
 * Garde D7 (« on ne fait confiance à AUCUNE source seule ») : le chemin reverse
 * (nom → EAN) passe déjà par `verifyEanMatchWithAI`, MAIS le chemin forward
 * (EAN → nom) n'avait aucun croisement → un EAN mal saisi ou réutilisé
 * (barcode reuse) résolvait une identité RÉELLE mais FAUSSE, auto-publiée en
 * confiance d'un seul tier (OBF/EAN-Search 0.90-0.97 ≥ 0.95).
 *
 * Seuil conservateur : on ne rétrograde qu'en cas de DIVERGENCE CLAIRE — deux
 * produits différents scorent ~0–0.2, tandis qu'un nom marchand terse mais
 * cohérent (« Crème » vs « Crème hydratante BioDerm ») reste haut grâce au poids
 * du recouvrement de mots dans `scoreNameMatch`. Coût d'un faux downgrade =
 * friction (review 1-tap, pas un rejet) ; coût d'un faux positif manqué =
 * identité fausse publiée (violation north-star) → on biaise vers la détection.
 */
export const IDENTITY_CONCORDANCE_THRESHOLD = 0.25;

/**
 * Évalue la concordance nom-marchand ↔ nom-résolu-par-source (garde D7).
 * Retourne `undefined` si non évaluable (un des deux noms manque) → pas de
 * downgrade.
 *
 * SOURCE UNIQUE de la garde — traversée par `runCascade` (scoring cascade) ET
 * par les chemins jumeaux qui adoptent un nom résolu HORS cascade (facture
 * `validate`). Un chemin qui adopte une identité EAN sans passer ici est un trou
 * de la classe « barbecue sur casque » (audit 2026-07-08, M3 CRITIQUE).
 */
export function evalIdentityConcordance(
    merchantName: string | null | undefined,
    resolvedName: string | null,
    brand: string | null | undefined,
): boolean | undefined {
    if (!merchantName || !resolvedName) return undefined;
    return (
        scoreNameMatch(merchantName, resolvedName, brand ?? null) >=
        IDENTITY_CONCORDANCE_THRESHOLD
    );
}
