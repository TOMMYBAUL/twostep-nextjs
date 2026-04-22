import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/email/encryption";
import { getAdapter, type IPOSAdapter } from "./index";

export type ActivePosConnection = {
    provider: string;
    accessToken: string;
    adapter: IPOSAdapter;
    shopDomain: string | null;
};

/**
 * Fetch the merchant's active POS connection and return a fresh access token,
 * refreshing via the adapter if it's about to expire. Returns null if no
 * connection exists or the refresh failed.
 *
 * Uses an admin client so it can be called from places where the user-scoped
 * client cannot read pos_connections (e.g. cron, webhooks, post-validation hooks).
 */
export async function getActivePosAccessToken(
    supabase: SupabaseClient,
    merchantId: string,
): Promise<ActivePosConnection | null> {
    const { data: conn } = await supabase
        .from("pos_connections")
        .select("id, provider, access_token, refresh_token, expires_at, shop_domain")
        .eq("merchant_id", merchantId)
        .order("last_sync_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

    if (!conn) return null;

    const adapter = getAdapter(conn.provider);
    let accessToken = decrypt(conn.access_token);

    const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : Infinity;
    const fiveMinFromNow = Date.now() + 5 * 60 * 1000;

    if (expiresAt < fiveMinFromNow && conn.refresh_token) {
        const refreshResult = await adapter.refreshToken(decrypt(conn.refresh_token));
        if (!refreshResult) {
            await supabase
                .from("pos_connections")
                .update({ last_sync_status: "error", last_sync_error: "Token expired" })
                .eq("id", conn.id);
            return null;
        }
        await supabase
            .from("pos_connections")
            .update({
                access_token: encrypt(refreshResult.access_token),
                refresh_token: encrypt(refreshResult.refresh_token),
                expires_at: refreshResult.expires_at,
            })
            .eq("id", conn.id);
        accessToken = refreshResult.access_token;
    }

    return {
        provider: conn.provider,
        accessToken,
        adapter,
        shopDomain: conn.shop_domain,
    };
}
