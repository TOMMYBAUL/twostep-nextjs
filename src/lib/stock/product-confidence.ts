import { computeStockConfidence, stockStateLabel } from "@/lib/stock/confidence";
import type { SourceStrength, StockConfidence } from "@/lib/stock/confidence";
import { downgradeForReports } from "@/lib/stock/reports";

/**
 * Force de la source de stock pour un produit donné :
 * - produit lié à une caisse connectée (pos_item_id) → webhook/sync temps réel ;
 * - marchand équipé d'un jeton d'ingestion (push fichier) → snapshot ;
 * - sinon → saisie manuelle (jamais "Disponible", au mieux "Probable").
 */
export function resolveSourceStrength(input: { posItemId: string | null; merchantHasIngest: boolean }): SourceStrength {
    if (input.posItemId) return "realtime";
    if (input.merchantHasIngest) return "snapshot";
    return "manual";
}

export type ProductConfidence = StockConfidence & {
    /** Libellé FR prêt à afficher ("Disponible" / "Stock probable" / "Épuisé"). */
    label: string;
};

/**
 * Point d'entrée unique des routes API : confiance affichable d'un produit.
 * Combine la confiance brute (fraîcheur + force de source) et la dégradation
 * par signalements consommateurs récents ("pas en stock sur place").
 * Le front n'a qu'à afficher `confidence.label` (+ `freshnessLabel`).
 */
export function productConfidence(input: {
    quantity: number;
    lastEventAt: Date | string | null;
    posItemId: string | null;
    merchantHasIngest: boolean;
    recentNotInStoreReports: number;
    now?: Date;
}): ProductConfidence {
    const source = resolveSourceStrength(input);
    const base = computeStockConfidence({
        quantity: input.quantity,
        lastEventAt: input.lastEventAt,
        source,
        now: input.now,
    });
    const state = downgradeForReports(base.state, input.recentNotInStoreReports);
    return {
        state,
        // Un produit affiché "Épuisé" n'a pas de fraîcheur pertinente.
        freshnessLabel: state === "out" ? null : base.freshnessLabel,
        reason: state === base.state ? base.reason : `${base.reason} downgraded by ${input.recentNotInStoreReports} report(s)`,
        label: stockStateLabel(state),
    };
}
