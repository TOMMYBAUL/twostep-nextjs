/**
 * Disponibilité Google HONNÊTE — SOURCE UNIQUE des sorties Google (Voie A `feed.ts`,
 * Voie B `lfp-xml.ts`, `feed-preview` via le transform Voie A, `inventory.ts`).
 *
 * Bug fermé ici (pilote-critique) : les feeds publiaient `availability = quantity > 0`
 * BRUT, en ignorant le maillon CONFIANCE/FRAÎCHEUR (M5). Un stock saisi à la main ou
 * périmé partait « in stock » sur Google = le faux positif exact que le projet promet
 * d'éliminer (north-star « exactitude = la promesse »).
 *
 * RÈGLE (décision produit arrêtée — défaut CONSERVATEUR, jamais de faux « en stock ») :
 * un produit ne part « in stock » QUE si sa confiance M5 est `available`, c.-à-d. :
 *   - source FIABLE : `stock.source` ∈ {webhook (realtime), pos_sync/file_push (snapshot)} —
 *     une source manuelle (scan/invoice/cloture/manual/inconnue) n'est JAMAIS « in stock » ;
 *   - fraîcheur : `source_ts` (plafonné par `updated_at`, cf. `freshnessTs`) dans la
 *     fenêtre M5 `FRESH_LIMIT_H` (realtime 24 h, snapshot 12 h) ;
 *   - quantité saine : > 2 (la zone qty ≤ 2 est celle où le système ment le plus — M5
 *     la classe `probable`, donc conservateur → « out of stock »).
 * Tout le reste (`probable`, `out`) → « out of stock ». On GARDE l'offre dans le feed
 * (elle rebascule « in stock » dès qu'une donnée fraîche arrive) — on ne l'exclut PAS.
 *
 * AUCUN seuil réinventé : tout est délégué aux helpers M5 (`computeStockConfidence`,
 * `sourceStrengthFromStored`, `stockRowToConfidenceInput`). Pur (pas d'I/O) → testable.
 */

import { computeStockConfidence } from "@/lib/stock/confidence";
import {
    sourceStrengthFromStored,
    stockRowToConfidenceInput,
    type StockRowForConfidence,
} from "@/lib/stock/product-confidence";

/**
 * Google Merchant Center attend les littéraux AVEC ESPACE (« in stock » / « out of stock ») —
 * la forme à underscore = rejet SILENCIEUX du feed (cf. feed.ts / inventory.ts).
 */
export type GoogleAvailability = "in stock" | "out of stock";

/**
 * Forme de la ligne `stock` attendue par les SELECTs des sorties Google :
 * `stock(quantity, source, source_ts, updated_at)`. PostgREST renvoie objet OU tableau.
 */
export type FeedStockRow = StockRowForConfidence;

/**
 * Disponibilité Google d'un produit à partir de sa ligne `stock` (embed PostgREST).
 *
 * @param stock — embed `stock(quantity, source, source_ts, updated_at)` (objet, tableau,
 *   ou null). Un SELECT qui n'apporte PAS `source`/`source_ts` retombe sur `manual`/sans
 *   fraîcheur → « out of stock » (défaut conservateur, jamais un faux « en stock »).
 * @param nowMs — horloge de référence, capturée UNE fois par feed par le caller (parité
 *   intra-feed : le même produit ne doit pas basculer entre deux pages du même run).
 */
export function feedAvailability(
    stock: FeedStockRow | FeedStockRow[] | null | undefined,
    nowMs: number = Date.now(),
): GoogleAvailability {
    const { quantity, lastEventAt, storedSource } = stockRowToConfidenceInput(stock);
    const { state } = computeStockConfidence({
        quantity,
        lastEventAt,
        source: sourceStrengthFromStored(storedSource),
        now: new Date(nowMs),
    });
    // `available` est le SEUL état qui autorise « in stock ». `probable` (source manuelle,
    // donnée périmée, qty basse) et `out` → « out of stock » : en cas de doute, on ne
    // promet PAS au consommateur un produit qu'il risque de ne pas trouver en boutique.
    return state === "available" ? "in stock" : "out of stock";
}
