import type { SupabaseClient } from "@supabase/supabase-js";

/** Origine d'une écriture de stock — tracée pour une confidence honnête. */
export type StockSource = "webhook" | "pos_sync" | "file_push" | "scan" | "invoice" | "cloture" | "manual";

export async function updateStockAtomic(
    supabase: SupabaseClient,
    productId: string,
    quantity: number,
    mode: "absolute" | "delta",
    source: StockSource = "manual",
    /** Horodatage de la VÉRITÉ source (ex. heure de la vente). Défaut = maintenant. */
    sourceTs?: string,
): Promise<number> {
    const { data, error } = await supabase.rpc("update_stock_atomic", {
        p_product_id: productId,
        p_quantity: quantity,
        p_mode: mode,
        p_source: source,
        ...(sourceTs ? { p_source_ts: sourceTs } : {}),
    });
    if (error) throw new Error(`update_stock_atomic failed: ${error.message}`);
    return (data as number) ?? 0;
}
