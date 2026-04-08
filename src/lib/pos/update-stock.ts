import type { SupabaseClient } from "@supabase/supabase-js";

export async function updateStockAtomic(
    supabase: SupabaseClient,
    productId: string,
    quantity: number,
    mode: "absolute" | "delta",
): Promise<number> {
    const { data, error } = await supabase.rpc("update_stock_atomic", {
        p_product_id: productId,
        p_quantity: quantity,
        p_mode: mode,
    });
    if (error) throw new Error(`update_stock_atomic failed: ${error.message}`);
    return (data as number) ?? 0;
}
