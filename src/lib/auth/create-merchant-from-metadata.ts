import type { SupabaseClient, User } from "@supabase/supabase-js";

import { captureError } from "@/lib/error";

/**
 * After a newly-confirmed user lands on /auth/callback or /auth/confirm,
 * if their user_metadata carries the merchant payload captured at signup,
 * insert the merchants row idempotently.
 *
 * Called from both /auth/callback (PKCE code flow) and /auth/confirm
 * (token_hash OTP flow) so the signup flow works regardless of which
 * Supabase email template delivered the link.
 */
export async function createMerchantFromMetadata(
    supabase: SupabaseClient,
    user: User,
): Promise<{ created: boolean }> {
    const meta = user.user_metadata ?? {};
    if (meta.role !== "merchant" || !meta.merchant_name) {
        return { created: false };
    }

    const { data: existing } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
    if (existing) return { created: false };

    const address = (meta.merchant_address as string) ?? "";
    const city = (meta.merchant_city as string) ?? "";
    let lat = 43.6047;
    let lng = 1.4442;

    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (mapboxToken && address && city) {
        try {
            const query = encodeURIComponent(`${address}, ${city}, France`);
            const geoRes = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxToken}&limit=1&country=FR`,
            );
            if (geoRes.ok) {
                const coords = (await geoRes.json()).features?.[0]?.center;
                if (coords) { lng = coords[0]; lat = coords[1]; }
            }
        } catch {
            // keep Toulouse centre fallback
        }
    }

    const { error } = await supabase.from("merchants").insert({
        user_id: user.id,
        name: meta.merchant_name,
        address,
        city,
        location: `SRID=4326;POINT(${lng} ${lat})`,
        siret: (meta.merchant_siret as string) ?? null,
        phone: (meta.merchant_phone as string) ?? null,
        status: meta.merchant_siret_pending ? "pending" : "active",
    });

    if (error) {
        // L'insertion du marchand a échoué mais le caller (callback/confirm/finalize)
        // redirige quand même vers /dashboard → sans ce signal, le marchand inscrit se
        // retrouve SANS ligne `merchants` et personne ne le sait (perte silencieuse n°1).
        captureError(error, { phase: "createMerchantFromMetadata", userId: user.id });
    }

    return { created: !error };
}
