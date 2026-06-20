import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/error";

/**
 * Recalculate available_sizes on the principal product of a group
 * after a stock change. Works with admin client (no RLS).
 */
export async function recalculateGroupSizesAdmin(productId: string): Promise<void> {
    const supabase = createAdminClient();

    const { data: product } = await supabase
        .from("products")
        .select("id, variant_of")
        .eq("id", productId)
        .single();

    if (!product) return;

    const principalId = product.variant_of ?? product.id;

    // Get all members of this group (principal + variants)
    const { data: members } = await supabase
        .from("products")
        .select("id, size, stock(quantity)")
        .or(`id.eq.${principalId},variant_of.eq.${principalId}`);

    if (!members || members.length === 0) return;

    const availableSizes = members
        .filter((m) => m.size)
        .map((m) => ({
            size: m.size!,
            quantity: (m as any).stock?.[0]?.quantity ?? (m as any).stock?.quantity ?? 0,
        }))
        .sort((a, b) => {
            const na = parseFloat(a.size);
            const nb = parseFloat(b.size);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.size.localeCompare(b.size);
        });

    const totalStock = availableSizes.reduce((sum, s) => sum + s.quantity, 0);

    // Aucune taille = ce n'est PAS un groupe multi-tailles à totaliser, mais un produit
    // SOLO (article sans pointure : la majorité du non-mode). Sa ligne stock vient d'être
    // posée de façon AUTORITAIRE par updateStockAtomic (le webhook appelant) ; la REMPLACER
    // par le total des tailles (= 0 ici) l'EFFACERAIT → faux « rupture » jusqu'au resync 6 h
    // = vente perdue silencieuse (enjeu n°1). De même, ne pas écraser un available_sizes déjà
    // rempli (ingestion fichier, cf. groupVariantsByEAN non-destructif) par []. On sort.
    if (availableSizes.length === 0) return;

    // Les writes du rollup ne doivent pas échouer EN SILENCE : un available_sizes/total
    // périmé masqué en succès = dérive d'affichage invisible. On ne LÈVE pas (le stock
    // autoritaire est déjà committé par updateStockAtomic ; faire échouer le webhook le
    // ferait rejouer, double-décrément en mode delta), mais on REND VISIBLE via Sentry.
    const { error: sizesErr } = await supabase
        .from("products")
        .update({ available_sizes: availableSizes })
        .eq("id", principalId);
    if (sizesErr) captureError(sizesErr, { context: "recalc-group-sizes-admin", principalId, write: "available_sizes" });

    const { error: stockErr } = await supabase
        .from("stock")
        .upsert({ product_id: principalId, quantity: totalStock }, { onConflict: "product_id" });
    if (stockErr) captureError(stockErr, { context: "recalc-group-sizes-admin", principalId, write: "stock_total" });
}
