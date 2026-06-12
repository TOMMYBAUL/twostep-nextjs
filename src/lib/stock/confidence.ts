/**
 * État de confiance du stock affiché au consommateur.
 *
 * Principe (validé par l'analyse concurrentielle : Google, NearSt, Locally) :
 * on n'affiche JAMAIS un compteur brut. Le stock système est faux ~1 fois sur 3
 * (Auburn RFID Lab ~65%). On affiche donc un ÉTAT honnête, fonction de la
 * fraîcheur du dernier événement stock et de la force de la source.
 *
 * - "available"  : source caisse (temps réel/snapshot) récente + quantité saine.
 * - "probable"   : source faible (saisie manuelle/sans caisse), ou donnée périmée,
 *                  ou quantité basse (zone où le système ment le plus : vol/casse).
 * - "out"        : quantité <= 0.
 *
 * Le gate d'identité (≥0,95) gère séparément la VISIBILITÉ ; cette fonction gère
 * la CONFIANCE de stock d'un produit déjà jugé identifiable.
 */

export type StockState = "available" | "probable" | "out";

/** Force de la source de la dernière mise à jour de stock. */
export type SourceStrength = "realtime" | "snapshot" | "manual";

export type StockConfidence = {
    state: StockState;
    /** Libellé de fraîcheur relatif, ex. "vu il y a 12 min". null si épuisé / inconnu. */
    freshnessLabel: string | null;
    /** Raison interne (debug/monitoring), non affichée. */
    reason: string;
};

/** Limite de fraîcheur (heures) au-delà de laquelle une source caisse devient "probable". */
const FRESH_LIMIT_H: Record<Exclude<SourceStrength, "manual">, number> = {
    realtime: 24, // webhook de vente : on fait confiance plus longtemps
    snapshot: 12, // push fichier 15 min : un peu plus prudent
};

function freshnessLabel(ageMs: number): string | null {
    if (!Number.isFinite(ageMs)) return null;
    const min = Math.floor(ageMs / 60_000);
    if (min < 1) return "vu à l'instant";
    if (min < 60) return `vu il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `vu il y a ${h} h`;
    const j = Math.floor(h / 24);
    return `vu il y a ${j} j`;
}

export function computeStockConfidence(input: {
    quantity: number;
    lastEventAt: Date | string | null;
    source: SourceStrength;
    now?: Date;
}): StockConfidence {
    const now = input.now ?? new Date();

    if (input.quantity <= 0) {
        return { state: "out", freshnessLabel: null, reason: "quantity<=0" };
    }

    const last = input.lastEventAt ? new Date(input.lastEventAt) : null;
    const ageMs = last ? now.getTime() - last.getTime() : Number.POSITIVE_INFINITY;
    const label = freshnessLabel(ageMs);

    // Source manuelle / sans caisse : jamais "available", au mieux "probable".
    if (input.source === "manual") {
        return { state: "probable", freshnessLabel: label, reason: "manual source" };
    }

    const freshLimitH = FRESH_LIMIT_H[input.source];
    const ageH = ageMs / 3_600_000;

    if (last && ageH <= freshLimitH) {
        // Quantité basse = zone de plus forte erreur système (vol, casse, dernier exemplaire).
        if (input.quantity <= 2) {
            return { state: "probable", freshnessLabel: label, reason: "low qty" };
        }
        return { state: "available", freshnessLabel: label, reason: "fresh+strong" };
    }

    return { state: "probable", freshnessLabel: label, reason: last ? "stale" : "no event" };
}

/** Libellé court côté consommateur pour un état donné. */
export function stockStateLabel(state: StockState): string {
    switch (state) {
        case "available":
            return "Disponible";
        case "probable":
            return "Stock probable";
        case "out":
            return "Épuisé";
    }
}
