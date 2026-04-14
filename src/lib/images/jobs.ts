import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseClient = ReturnType<typeof createAdminClient>;

export async function createImageJob(
    productId: string,
    merchantId: string,
    sourceUrl: string,
    supabaseClient?: SupabaseClient,
): Promise<boolean> {
    const supabase = supabaseClient ?? createAdminClient();

    // Dédoublonnage : pas de job pending/processing pour ce produit
    const { data: existing } = await supabase
        .from("image_jobs")
        .select("id")
        .eq("product_id", productId)
        .in("status", ["pending", "processing"])
        .maybeSingle();

    if (existing) return false;

    const { error } = await supabase.from("image_jobs").insert({
        product_id: productId,
        merchant_id: merchantId,
        source_url: sourceUrl,
    });

    return !error;
}

export async function createImageJobsForMerchant(merchantId: string, supabaseClient?: SupabaseClient): Promise<number> {
    const supabase = supabaseClient ?? createAdminClient();

    // Produits avec photo_url mais sans photo_processed_url
    const { data: products } = await supabase
        .from("products")
        .select("id, photo_url")
        .eq("merchant_id", merchantId)
        .not("photo_url", "is", null)
        .is("photo_processed_url", null);

    if (!products || products.length === 0) return 0;

    let created = 0;
    for (const product of products) {
        const ok = await createImageJob(product.id, merchantId, product.photo_url!);
        if (ok) created++;
    }

    return created;
}
