import {
    isFeedEligible,
    summarizePublishability,
    type FeedEligibleRow,
    type FeedEligibilityOptions,
    type PublishabilitySummary,
} from "@/lib/google/feed-eligibility";
import { computeStockConfidence } from "@/lib/stock/confidence";
import {
    sourceStrengthFromStored,
    stockRowToConfidenceInput,
    type StockRowForConfidence,
} from "@/lib/stock/product-confidence";

/**
 * G1 (audit 07-04, Cluster G — « la valeur qu'on VEND au pilote ») : métrique SLA
 * « % d'offres fraîches / publiables » par marchand — le chiffre NearSt-style qu'on
 * montre à Deerskin pour justifier l'abonnement.
 *
 * SOURCE UNIQUE, zéro logique re-dérivée (LESSONS « garde répliquée → helper unique ») :
 *  - « publiable » = `summarizePublishability` = le VRAI gate du feed Google
 *    (`isFeedEligible`), mêmes options (`allowMissingImage` du tier GTIN-only D2) ;
 *  - « frais » = `computeStockConfidence` = LA définition de confiance affichée au
 *    consommateur (fraîcheur `source_ts` honnête via `stockRowToConfidenceInput`,
 *    force de source via `sourceStrengthFromStored`). Un produit est « frais » ssi
 *    son état serait « available » (= affiché « Disponible ») : source caisse
 *    récente + quantité saine. Le SLA ne peut donc PAS diverger de ce que le
 *    consommateur / Google voit réellement.
 *
 * VOLONTAIREMENT SANS `downgradeForReports` : le SLA mesure la fraîcheur de la DATA
 * (ce que le marchand contrôle : sa caisse pousse-t-elle ?), pas la confiance
 * consommateur ajustée des signalements (qui exigerait une lecture `stock_reports`
 * par produit sur TOUT le catalogue de TOUS les marchands dans le cron quotidien).
 * Conséquence assumée : le % peut être légèrement PLUS optimiste que l'affichage
 * conso pour un produit signalé « pas en boutique » — documenté, pas caché.
 *
 * Helpers PURS (aucune I/O) → testables champ par champ, partagés par le cron
 * `quality-check` (historique quotidien) ET `/api/google/stats` (tuile temps réel) :
 * même calcul des deux côtés = la tuile et l'historique ne peuvent pas se contredire.
 */

/** Ligne produit minimale pour le calcul SLA d'une population DÉJÀ filtrée (feed). */
export type SlaProductRow = FeedEligibleRow & {
    /** Ligne `stock` jointe (PostgREST renvoie 1 objet ou un tableau). */
    stock: StockRowForConfidence | StockRowForConfidence[] | null;
};

export type SlaSnapshot = PublishabilitySummary & {
    /** Produits de la population avec quantité > 0 (le stock qu'on peut montrer). */
    in_stock: number;
    /** Publiables (gate feed) ET en stock = les offres réellement montrables sur Google. */
    publishable_in_stock: number;
    /**
     * Sous-ensemble de `publishable_in_stock` dont la confiance stock est « available »
     * (= affiché « Disponible ») : source caisse (webhook/pos_sync/file_push) dans sa
     * fenêtre de fraîcheur ET quantité > 2. C'est le numérateur du SLA fraîcheur.
     */
    fresh_available: number;
    /** % `fresh_available` / `publishable_in_stock`, arrondi. 0 si aucune offre en stock. */
    freshness_score: number;
};

/**
 * SLA d'UNE population de produits (déjà filtrée par le caller : visible + validated +
 * non archivé + non variante — la même que le feed et que `/api/google/stats`).
 * `now` injectable → déterministe en test.
 */
export function computeSlaForPopulation(
    rows: SlaProductRow[],
    opts: FeedEligibilityOptions = {},
    now: Date = new Date(),
): SlaSnapshot {
    // Publiabilité : LE gate réel du feed (jamais un proxy re-dérivé).
    const summary = summarizePublishability(rows, opts);

    let in_stock = 0;
    let publishable_in_stock = 0;
    let fresh_available = 0;

    for (const row of rows) {
        // Fraîcheur/quantité/source HONNÊTES : `source_ts` plafonné à `updated_at`
        // (jamais plus frais que la réalité), source RÉELLE tracée (migration 104).
        const { quantity, lastEventAt, storedSource } = stockRowToConfidenceInput(row.stock);
        if (!(quantity > 0)) continue;
        in_stock++;

        // Même prédicat que le gate feed (source unique `isFeedEligible`) — appliqué par
        // produit pour le CROISEMENT publiable×en-stock.
        if (!isFeedEligible(row, opts)) continue;
        publishable_in_stock++;

        const confidence = computeStockConfidence({
            quantity,
            lastEventAt,
            source: sourceStrengthFromStored(storedSource),
            now,
        });
        if (confidence.state === "available") fresh_available++;
    }

    const freshness_score =
        publishable_in_stock > 0 ? Math.round((fresh_available / publishable_in_stock) * 100) : 0;

    return { ...summary, in_stock, publishable_in_stock, fresh_available, freshness_score };
}

/** Ligne produit telle que lue par le cron `quality-check` (TOUS produits non archivés). */
export type MerchantSlaRow = SlaProductRow & {
    merchant_id: string;
    visible: boolean | null;
    review_status: string | null;
    variant_of: string | null;
};

export type MerchantSlaSnapshot = SlaSnapshot & { merchant_id: string };

/**
 * Population feed d'un produit — PARITÉ STRICTE avec le filtre SQL de
 * `/api/google/stats` et des 2 feeds live (`visible=true`, `review_status='validated'`,
 * `variant_of IS NULL` ; `archived_at IS NULL` est déjà filtré en SQL par le cron).
 * Un produit pending/masqué/variante n'entre NI dans le dénominateur NI dans le
 * numérateur : le SLA parle des offres que le feed CONSIDÈRE, pas du brouillon.
 */
function isFeedPopulation(row: Pick<MerchantSlaRow, "visible" | "review_status" | "variant_of">): boolean {
    return row.visible === true && row.review_status === "validated" && row.variant_of == null;
}

/**
 * Snapshots SLA par marchand à partir de la lecture produits GLOBALE du cron
 * `quality-check` (coût marginal ~0 : les lignes sont déjà en mémoire pour les
 * watchdogs). Ordre de sortie déterministe (merchant_id croissant).
 * Un marchand sans AUCUN produit dans la population feed n'émet pas de snapshot
 * (rien à mesurer ≠ « 0 % » trompeur).
 */
export function computeMerchantSlaSnapshots(
    rows: MerchantSlaRow[],
    opts: FeedEligibilityOptions = {},
    now: Date = new Date(),
): MerchantSlaSnapshot[] {
    const byMerchant = new Map<string, MerchantSlaRow[]>();
    for (const row of rows) {
        if (!row.merchant_id) continue;
        if (!isFeedPopulation(row)) continue;
        const arr = byMerchant.get(row.merchant_id) ?? [];
        arr.push(row);
        byMerchant.set(row.merchant_id, arr);
    }

    return [...byMerchant.keys()].sort().map((merchantId) => ({
        merchant_id: merchantId,
        ...computeSlaForPopulation(byMerchant.get(merchantId)!, opts, now),
    }));
}
