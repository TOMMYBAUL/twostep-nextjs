import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/error";
import { chunk } from "@/lib/ingest/reconcile";
import {
    productConfidence,
    publicConfidencePayload,
    stockRowToConfidenceInput,
    type PublicConfidence,
    type StockRowForConfidence,
} from "@/lib/stock/product-confidence";
import { reportsWindowStartIso } from "@/lib/stock/reports";

/**
 * P0-4 — Brancher M5 (confiance/fraîcheur) sur les surfaces CONSO (discover /
 * recherche / favoris / boutique). Avant : ces surfaces affichaient « Stock
 * vérifié » sur le seul `quantity > 0` (compteur brut) pendant que la page
 * produit disait « Stock probable » et le feed Google « out of stock » =
 * 3 vérités contradictoires. Ce module est le point d'entrée UNIQUE des routes
 * de LISTE : il lit la vérité (`stock.source`/`source_ts` — migration 104,
 * signalements récents, ingest) en BATCH et délègue le verdict au même cœur pur
 * `productConfidence` que les routes déjà branchées (`products/[id]`, `by-ean`,
 * `by-merchants`) → le verdict ne peut pas diverger entre surfaces.
 *
 * FLAG (préparation P0-4, mission 2026-07-07) : tout est inerte tant que
 * `CONSUMER_M5_CONFIDENCE=1` n'est pas posé — les routes n'émettent pas le champ
 * `confidence`, l'UI garde son rendu actuel. Le rendu final = jugement Thomas.
 */
export function consumerM5Enabled(): boolean {
    return process.env.CONSUMER_M5_CONFIDENCE === "1";
}

export type ConfidenceTarget = {
    productId: string;
    merchantId: string | null;
    /** Optionnel (routes RPC ne l'ont pas) — ne sert qu'au fallback legacy si `stock.source` est null. */
    posItemId?: string | null;
};

type StockRow = StockRowForConfidence & { product_id: string };

/** Borne LESSONS : un `.in()` non borné dépasse la limite d'URL PostgREST → lots de 500. */
const IN_CHUNK = 500;

/**
 * Trip-wire anti-régression RLS (revue SF-hunter P0-4, MED) : la lecture `stock`
 * passe par le client de la route (soumis à RLS). Une policy `stock_select_public`
 * qui régresse (déjà arrivé : migrations 097/098) renverrait `{data: [], error:
 * null}` = indiscernable de « aucun stock » → TOUTES les surfaces conso
 * afficheraient « Épuisé » en silence. Un lot d'au moins ce nombre de produits qui
 * revient 100 % vide est traité comme un ÉCHEC de lecture (« pas pu vérifier »,
 * pas « épuisé confirmé ») + Sentry. Faux déclenchement possible mais bénin
 * (verdict prudent + 1 événement Sentry), le vrai déclenchement sauve le feed.
 */
const RLS_TRIPWIRE_MIN = 50;

// Clients structurels minimaux (permet les faux clients de test, comme les voisins).
/* eslint-disable @typescript-eslint/no-explicit-any */
type SupabaseLike = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Confiance M5 pour une LISTE de produits, en lectures batchées.
 *
 * Sémantique d'échec (honnêteté north-star « jamais “Disponible” sans preuve ») :
 * - lecture `stock` en échec → les produits du lot touché sont ABSENTS de la Map
 *   (= « pas pu vérifier », l'UI retombe sur l'état prudent) + `captureError`.
 *   Jamais un verdict fabriqué sur une lecture douteuse (leçon read-modify-write).
 * - lecture `ingest_credentials` en échec → fallback `merchantHasIngest=false`
 *   (dégrade vers « manual »/« probable », ne peut jamais SURÉVALUER) + `captureError`.
 * - lecture `stock_reports` en échec → 0 signalement retenu (l'état de base est
 *   affiché — même sémantique que `by-merchants` aujourd'hui, mais désormais
 *   OBSERVABLE via Sentry ; un blip ne bascule pas tout le feed en « Épuisé »).
 * - produit SANS ligne stock (lecture OK) → quantity 0 → « Épuisé » (honnête).
 */
export async function resolveConsumerConfidence(
    targets: ConfidenceTarget[],
    clients: { supabase: SupabaseLike; admin?: SupabaseLike; now?: Date },
): Promise<Map<string, PublicConfidence>> {
    const map = new Map<string, PublicConfidence>();
    const productIds = [...new Set(targets.map((t) => t.productId).filter(Boolean))];
    if (productIds.length === 0) return map;

    const now = clients.now ?? new Date();

    // ── 1. stock (source de vérité quantité + source + fraîcheur) — lots en parallèle ──
    const stockRows = new Map<string, StockRow>();
    const stockFailedIds = new Set<string>();
    await Promise.all(
        chunk(productIds, IN_CHUNK).map(async (ids) => {
            const { data, error } = await clients.supabase
                .from("stock")
                .select("product_id, quantity, updated_at, source, source_ts")
                .in("product_id", ids);
            // `data=null` SANS error = échec aussi (LESSONS) : ne jamais lire « pas de stock ».
            // Lot large 100 % vide = signature d'une policy RLS régressée (cf. RLS_TRIPWIRE_MIN).
            const suspectEmpty = !error && data && data.length === 0 && ids.length >= RLS_TRIPWIRE_MIN;
            if (error || !data || suspectEmpty) {
                captureError(
                    error ??
                        new Error(
                            suspectEmpty
                                ? `stock read returned 0 rows for ${ids.length} products — possible RLS regression (cf. 097/098)`
                                : "stock read returned null data",
                        ),
                    { helper: "resolveConsumerConfidence", step: "stock", productCount: ids.length },
                );
                for (const id of ids) stockFailedIds.add(id);
                return;
            }
            for (const row of data as StockRow[]) stockRows.set(row.product_id, row);
        }),
    );

    // ingest_credentials et stock_reports sont en RLS owner-only → client admin
    // (même frontière que `by-merchants` ; seuls des ÉTATS agrégés sortent d'ici).
    const admin = clients.admin ?? createAdminClient();

    // ── 2. ingest_credentials — SEULEMENT pour les produits dont `stock.source` est
    // null (legacy pré-104) : c'est le seul cas où le fallback structurel est consulté.
    const fallbackMerchantIds = [
        ...new Set(
            targets
                .filter((t) => {
                    if (!t.merchantId || stockFailedIds.has(t.productId)) return false;
                    const row = stockRows.get(t.productId);
                    return row != null && row.source == null && (row.quantity ?? 0) > 0;
                })
                .map((t) => t.merchantId as string),
        ),
    ];
    const ingestMerchants = new Set<string>();
    const reportCounts = new Map<string, number>();
    // Phases 2 et 3 indépendantes (revue SF-hunter : séquentiel amplifiait le risque
    // de timeout sur un gros catalogue vitrine) → lots ET phases en parallèle.
    await Promise.all([
        ...chunk(fallbackMerchantIds, IN_CHUNK).map(async (ids) => {
            const { data, error } = await admin
                .from("ingest_credentials")
                .select("merchant_id")
                .in("merchant_id", ids);
            if (error || !data) {
                // Fallback prudent : sans lecture fiable on suppose « pas d'ingest » →
                // source « manual » → au mieux « probable ». Dégrade, ne surévalue jamais.
                captureError(error ?? new Error("ingest_credentials read returned null data"), {
                    helper: "resolveConsumerConfidence",
                    step: "ingest-credentials",
                });
                return;
            }
            for (const row of data as { merchant_id: string }[]) ingestMerchants.add(row.merchant_id);
        }),
        // ── 3. signalements consommateurs récents (« pas en stock sur place ») ──
        ...chunk(productIds, IN_CHUNK).map(async (ids) => {
            const { data, error } = await admin
                .from("stock_reports")
                .select("product_id")
                .eq("reason", "not_in_store")
                .gte("created_at", reportsWindowStartIso(now))
                .in("product_id", ids);
            if (error || !data) {
                captureError(error ?? new Error("stock_reports read returned null data"), {
                    helper: "resolveConsumerConfidence",
                    step: "stock-reports",
                });
                return;
            }
            for (const row of data as { product_id: string }[]) {
                reportCounts.set(row.product_id, (reportCounts.get(row.product_id) ?? 0) + 1);
            }
        }),
    ]);

    // ── 4. verdict par produit — MÊME cœur pur que products/[id]/by-ean/by-merchants.
    // NB cohérence inter-surfaces (revue SF-hunter, LOW) : les routes RPC ne passent
    // pas `posItemId`, mais le chemin de repli structurel qui le lit est INATTEIGNABLE
    // en prod (migration 104 : `stock.source` NOT NULL DEFAULT 'manual' → storedSource
    // toujours présent). Si cet invariant NOT NULL était un jour affaibli, re-propager
    // `posItemId` ici. `products.id` = PK (un produit appartient à UN marchand) → Map
    // keyée par productId seul est correcte.
    for (const t of targets) {
        if (!t.productId || map.has(t.productId)) continue;
        // Lecture stock en échec → PAS d'entrée (« pas pu vérifier » ≠ « épuisé »).
        if (stockFailedIds.has(t.productId)) continue;
        map.set(
            t.productId,
            // Projection PUBLIQUE : `reason` (interne, peut trahir signalements/absence
            // de caisse) ne sort JAMAIS sur le fil (revue SF-hunter, MED).
            publicConfidencePayload(
                productConfidence({
                    ...stockRowToConfidenceInput(stockRows.get(t.productId) ?? null),
                    posItemId: t.posItemId ?? null,
                    merchantHasIngest: t.merchantId != null && ingestMerchants.has(t.merchantId),
                    recentNotInStoreReports: reportCounts.get(t.productId) ?? 0,
                    now,
                }),
            ),
        );
    }
    return map;
}

/**
 * Attache `confidence` à chaque item d'une réponse de liste (champ ADDITIF).
 * `null` = « pas pu vérifier » (lecture en échec) — distinct de l'absence du champ
 * (flag OFF). Les items sans `product_id` exploitable passent inchangés.
 */
export async function attachConsumerConfidence<
    T extends { product_id?: string | null; merchant_id?: string | null },
>(
    items: T[],
    clients: { supabase: SupabaseLike; admin?: SupabaseLike; now?: Date },
): Promise<(T & { confidence?: PublicConfidence | null })[]> {
    const targets: ConfidenceTarget[] = items
        .filter((i) => typeof i.product_id === "string" && i.product_id.length > 0)
        .map((i) => ({ productId: i.product_id as string, merchantId: i.merchant_id ?? null }));
    const map = await resolveConsumerConfidence(targets, clients);
    return items.map((i) =>
        typeof i.product_id === "string" && i.product_id.length > 0
            ? { ...i, confidence: map.get(i.product_id) ?? null }
            : i,
    );
}
