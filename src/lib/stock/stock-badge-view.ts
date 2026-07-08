import { stockStateLabel, type StockState } from "@/lib/stock/confidence";

/**
 * P0-4 — Vue PURE du badge de stock conso (client-safe, zéro I/O).
 *
 * Règle (LESSONS UI) : un verdict M5 calculé côté serveur s'AFFICHE, il ne se
 * recalcule JAMAIS côté client. Ce deriver ne fait que trier : verdict présent →
 * passthrough ; verdict absent (flag OFF, blip de lecture serveur → `confidence:
 * null`) → état PRUDENT dérivé de la seule quantité, qui ne peut JAMAIS être
 * « available » (« Stock vérifié »/« Disponible » sans preuve M5 = exactement le
 * mensonge que P0-4 ferme).
 */

/** Forme du champ `confidence` émis par les routes (sous-ensemble de ProductConfidence). */
export type ConfidencePayload = {
    state: StockState;
    label?: string | null;
    freshnessLabel?: string | null;
};

export type StockBadgeView = {
    state: StockState;
    label: string;
    /** Fraîcheur relative (« vu il y a 12 min ») — null si épuisé/inconnue. */
    freshnessLabel: string | null;
};

const KNOWN_STATES: ReadonlySet<string> = new Set(["available", "probable", "out"]);

export function deriveStockBadgeView(input: {
    confidence?: ConfidencePayload | null;
    quantity: number | null | undefined;
}): StockBadgeView {
    const c = input.confidence;
    if (c && KNOWN_STATES.has(c.state)) {
        // Verdict serveur : affiché tel quel, même si la quantité locale semble le
        // contredire (le serveur a lu source/fraîcheur/signalements — pas nous).
        return {
            state: c.state,
            label: c.label || stockStateLabel(c.state),
            freshnessLabel: c.state === "out" ? null : (c.freshnessLabel ?? null),
        };
    }
    // Pas de verdict exploitable → prudent. Quantité inconnue (null) ou ≤ 0 →
    // « Épuisé » (aligne le comportement actuel `?? 0` des favoris) ; > 0 →
    // « Stock probable » — jamais « Disponible » sans preuve.
    const qty = input.quantity;
    if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) {
        return { state: "out", label: stockStateLabel("out"), freshnessLabel: null };
    }
    return { state: "probable", label: stockStateLabel("probable"), freshnessLabel: null };
}
