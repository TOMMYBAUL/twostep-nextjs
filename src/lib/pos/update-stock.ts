import type { SupabaseClient } from "@supabase/supabase-js";
import { captureError } from "@/lib/error";

/** Origine d'une écriture de stock — tracée pour une confidence honnête. */
export type StockSource = "webhook" | "pos_sync" | "file_push" | "scan" | "invoice" | "cloture" | "manual";

/**
 * Résultat d'une écriture atomique de stock.
 *  - `previous` : quantité AVANT l'écriture (0 si la ligne stock n'existait pas).
 *  - `written`  : le stock a-t-il RÉELLEMENT changé ? `false` = écriture rejetée par la garde
 *    temporelle 104 (REPLACE périmé) OU quantité inchangée (retry du même absolu, delta clampé).
 *    Les appelants n'émettent un effet de bord DÉRIVÉ (feed_events sale/restock, notification
 *    « de retour en stock ») QUE si `written` — sinon on émet un événement FANTÔME (P0-6).
 */
export type StockWriteResult = { previous: number; written: boolean };

/**
 * Normalise le résultat brut du RPC `update_stock_atomic` en {previous, written}.
 *
 * Tolère les DEUX formes de retour → le code est sûr AVANT comme APRÈS la migration 110 :
 *  - RPC pré-110 (`RETURNS int`) → scalaire `v_previous`. On défaut `written=true` = comportement
 *    ACTUEL EXACT (émettre l'événement). Le fix P0-6 ne s'active donc qu'une fois la 110 appliquée.
 *  - RPC 110 (`RETURNS TABLE(previous, written)`) → PostgREST renvoie `[{previous, written}]`
 *    (fonction set-returning) ou un objet ; on lit les deux champs.
 * Toute forme inattendue retombe sur le défaut conservateur (previous=0, written=true) : ne
 * jamais SUPPRIMER un événement légitime sur une forme non reconnue.
 */
export function normalizeStockWriteResult(data: unknown): StockWriteResult {
    // Formes ATTENDUES (aucune alerte) :
    //  - scalaire int : RPC pré-110 (`RETURNS int`) → written=true = comportement actuel.
    //  - null/undefined : ligne stock absente côté SDK (défensif).
    if (typeof data === "number") {
        return { previous: data, written: true };
    }
    if (data == null) {
        return { previous: 0, written: true };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row === "object") {
        const rec = row as Record<string, unknown>;
        if (typeof rec.previous === "number" && typeof rec.written === "boolean") {
            return { previous: rec.previous, written: rec.written }; // RPC 110 attendu
        }
    }

    // Forme NON RECONNUE (lag de cache de schéma PostgREST après le DROP/CREATE de la 110,
    // renommage futur, réponse corrompue) : défaut CONSERVATEUR (written=true = ne jamais
    // SUPPRIMER un événement légitime) MAIS on le SIGNALE — sinon le garde P0-6 pourrait
    // s'éteindre EN SILENCE en prod (retour au bug « toujours émettre »). Observabilité = enjeu n°1.
    captureError(new Error("normalizeStockWriteResult: forme de retour update_stock_atomic non reconnue"), {
        lib: "update-stock",
        raw: typeof data === "object" ? JSON.stringify(data).slice(0, 200) : String(data),
    });
    return { previous: 0, written: true };
}

export async function updateStockAtomic(
    supabase: SupabaseClient,
    productId: string,
    quantity: number,
    mode: "absolute" | "delta",
    source: StockSource = "manual",
    /** Horodatage de la VÉRITÉ source (ex. heure de la vente). Défaut = maintenant. */
    sourceTs?: string,
): Promise<StockWriteResult> {
    const { data, error } = await supabase.rpc("update_stock_atomic", {
        p_product_id: productId,
        p_quantity: quantity,
        p_mode: mode,
        p_source: source,
        ...(sourceTs ? { p_source_ts: sourceTs } : {}),
    });
    if (error) throw new Error(`update_stock_atomic failed: ${error.message}`);
    return normalizeStockWriteResult(data);
}
