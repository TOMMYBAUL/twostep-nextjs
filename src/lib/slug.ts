import { createAdminClient } from "@/lib/supabase/admin";

const ACCENT_MAP = "àáâãäåèéêëìíîïòóôõöùúûüýÿñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝŸÑÇ";
const ASCII_MAP = "aaaaaaeeeeiiiioooooouuuuyyncAAAAAAEEEEIIIIOOOOOUUUUYYNC";

/**
 * Generate a slug from name + id, matching the DB trigger exactly.
 * Pure function — safe for client and server.
 */
export function generateSlug(name: string, id: string): string {
    let s = name;
    for (let i = 0; i < ACCENT_MAP.length; i++) {
        s = s.replaceAll(ACCENT_MAP[i], ASCII_MAP[i]);
    }
    s = s.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
    return `${s}-${id.slice(0, 8)}`;
}

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

    // Try exact slug match first
    const { data } = await supabase.from("products").select("id").eq("slug", slugOrId).single();
    if (data?.id) return data.id;

    // Fallback: extract the 8-char ID suffix from the slug and search by ID prefix
    const idSuffix = slugOrId.slice(-8);
    if (/^[0-9a-f]{8}$/i.test(idSuffix)) {
        const { data: fallback } = await supabase
            .from("products")
            .select("id")
            .like("id", `${idSuffix}%`)
            .limit(1)
            .single();
        return fallback?.id ?? null;
    }

    return null;
}
