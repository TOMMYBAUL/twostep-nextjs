import { computeStockConfidence, stockStateLabel } from "@/lib/stock/confidence";
import type { SourceStrength, StockConfidence } from "@/lib/stock/confidence";
import { downgradeForReports } from "@/lib/stock/reports";

/**
 * Force de la source à partir de la valeur RÉELLE `stock.source` (tracée à chaque
 * écriture — migration 104). C'est la voie HONNÊTE : on ne devine plus la source,
 * on lit celle de la dernière mise à jour de stock.
 *  - webhook (vente caisse temps réel) → realtime
 *  - pos_sync (resync périodique) / file_push (export fichier) → snapshot
 *  - scan / invoice / cloture / manual (déclarations ponctuelles) → manual
 */
export function sourceStrengthFromStored(source: string | null | undefined): SourceStrength {
    switch (source) {
        case "webhook":
            return "realtime";
        case "pos_sync":
        case "file_push":
            return "snapshot";
        default:
            return "manual"; // scan, invoice, cloture, manual, ou inconnu → prudent
    }
}

/**
 * Fallback LEGACY (rétrocompat) : déduit la force de source de la structure du
 * produit quand `stock.source` n'est pas disponible. À éviter — peut mentir
 * (un produit POS ajusté à la main resterait "realtime"). Préférer `stock.source`.
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
    /** Valeur réelle `stock.source` (migration 104) — voie honnête, prioritaire. */
    storedSource?: string | null;
    /** Fallback legacy si storedSource absent. */
    posItemId: string | null;
    merchantHasIngest: boolean;
    recentNotInStoreReports: number;
    now?: Date;
}): ProductConfidence {
    // Priorité à la source RÉELLE tracée ; fallback déduit seulement si absente.
    const source = input.storedSource != null
        ? sourceStrengthFromStored(input.storedSource)
        : resolveSourceStrength(input);
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
