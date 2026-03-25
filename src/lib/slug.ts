import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolve a slug or UUID to a merchant ID.
 * Returns the UUID if found, null otherwise.
 */
export async function resolveMerchantId(slugOrId: string): Promise<string | null> {
    const supabase = createAdminClient();

    // Try UUID first (faster, indexed primary key)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
    if (isUuid) {
        const { data } = await supabase.from("merchants").select("id").eq("id", slugOrId).single();
        return data?.id ?? null;
    }

    // Try slug
    const { data } = await supabase.from("merchants").select("id").eq("slug", slugOrId).single();
    return data?.id ?? null;
}

/**
 * Resolve a slug or UUID to a product ID.
 * Returns the UUID if found, null otherwise.
 */
export async function resolveProductId(slugOrId: string): Promise<string | null> {
    const supabase = createAdminClient();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
    if (isUuid) {
        const { data } = await supabase.from("products").select("id").eq("id", slugOrId).single();
        return data?.id ?? null;
    }

    const { data } = await supabase.from("products").select("id").eq("slug", slugOrId).single();
    return data?.id ?? null;
}
