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

/** Forme PUBLIQUE du verdict, émise sur le fil (routes API). */
export type PublicConfidence = {
    state: ProductConfidence["state"];
    label: string;
    freshnessLabel: string | null;
};

/**
 * Projection publique d'un verdict : `reason` est documenté « interne
 * (debug/monitoring), non affiché » (confidence.ts) mais il fuitait VERBATIM dans
 * le JSON des routes (« downgraded by 3 report(s) » = agrégat de `stock_reports`
 * RLS owner-only ; « manual source » = ce marchand n'a pas de caisse) — sur des
 * routes anonymes. Toute route qui émet un verdict passe par CETTE projection.
 */
export function publicConfidencePayload(c: ProductConfidence): PublicConfidence {
    return { state: c.state, label: c.label, freshnessLabel: c.freshnessLabel };
}

/** Forme minimale d'une ligne `stock` lue en DB (PostgREST renvoie 1 objet ou un tableau). */
export type StockRowForConfidence = {
    quantity?: number | null;
    /** Horodatage de la VÉRITÉ source (migration 104) — heure RÉELLE de l'observation. */
    source_ts?: string | null;
    /** Horodatage d'ÉCRITURE DB (bumpé à chaque write) — PAS la fraîcheur source. */
    updated_at?: string | null;
    /** Origine de la dernière écriture (migration 104). */
    source?: string | null;
};

/**
 * Fraîcheur honnête : l'observation source (`source_ts`) PLAFONNÉE à l'heure d'écriture DB
 * (`updated_at`). On ne peut pas avoir observé la source APRÈS l'avoir écrite → un
 * `source_ts` postérieur à `updated_at` est toujours un artefact (le DEFAULT now() de la
 * migration 104 a back-fillé les lignes pré-104 à l'heure de l'ALTER, plus récente que leur
 * vraie dernière observation ; ou dérive d'horloge POS). Dans ce cas on retombe sur le plus
 * ANCIEN des deux (prudent : ne jamais afficher plus frais que la réalité). Le cas honnête
 * normal — webhook de vente traité avec retard : `source_ts`(vente) < `updated_at`(now) —
 * renvoie bien `source_ts`. Si l'un est absent/illisible, on prend l'autre.
 */
function freshnessTs(sourceTs: string | null | undefined, updatedAt: string | null | undefined): string | null {
    if (!sourceTs) return updatedAt ?? null;
    if (!updatedAt) return sourceTs;
    const tSource = Date.parse(sourceTs);
    const tUpdated = Date.parse(updatedAt);
    if (!Number.isFinite(tSource)) return updatedAt;
    if (!Number.isFinite(tUpdated)) return sourceTs;
    return tSource <= tUpdated ? sourceTs : updatedAt;
}

/**
 * Mappe une ligne `stock` (DB) vers les entrées de fraîcheur/quantité/source de la confidence.
 *
 * RÈGLE D'HONNÊTETÉ (maillon 5 — north-star « fraîcheur source_ts vraie ») : la fraîcheur
 * affichée se lit sur **`source_ts`** (heure RÉELLE de l'observation source — migration 104),
 * JAMAIS sur `updated_at` (heure d'écriture DB, bumpée à chaque UPDATE). Un webhook de vente
 * traité avec retard/retry porte `updated_at=now` mais `source_ts=heure de la vente` : se baser
 * sur `updated_at` surévaluerait la fraîcheur (« vu à l'instant » pour une vente observée il y a
 * des heures) — exactement le mensonge que la confidence existe pour empêcher. Voir `freshnessTs`
 * pour le plafonnement défensif (lignes pré-104, dérive d'horloge).
 *
 * PostgREST peut renvoyer un objet OU un tableau selon la requête → on normalise les deux.
 */
export function stockRowToConfidenceInput(
    stock: StockRowForConfidence | StockRowForConfidence[] | null | undefined,
): { quantity: number; lastEventAt: string | null; storedSource: string | null } {
    const s = Array.isArray(stock) ? stock[0] : stock;
    return {
        quantity: s?.quantity ?? 0,
        lastEventAt: freshnessTs(s?.source_ts, s?.updated_at),
        storedSource: s?.source ?? null,
    };
}

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
