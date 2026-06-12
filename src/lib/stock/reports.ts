import type { StockState } from "@/lib/stock/confidence";

/**
 * Dégradation de l'état de stock affiché en fonction des signalements
 * consommateurs récents ("pas en stock sur place").
 *
 * C'est le filet de sécurité final contre le faux positif RESSENTI : même si la
 * caisse dit "en stock", si plusieurs clients signalent l'absence en rayon, on
 * croit les clients (le monde physique a raison du système).
 *
 * @param recentReports nombre de signalements "not_in_store" sur la fenêtre récente (ex. 48 h).
 */
export const REPORTS_TO_PROBABLE = 1;
export const REPORTS_TO_OUT = 3;

export function downgradeForReports(state: StockState, recentReports: number): StockState {
    if (state === "out") return "out";
    if (recentReports >= REPORTS_TO_OUT) return "out";
    if (recentReports >= REPORTS_TO_PROBABLE) return "probable";
    return state;
}
