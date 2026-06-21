import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/email/encryption";
import { getAdapter, type IPOSAdapter } from "./index";

export type ActivePosConnection = {
    provider: string;
    accessToken: string;
    adapter: IPOSAdapter;
    shopDomain: string | null;
};

type RefreshableConn = {
    id: string;
    access_token: string;
    refresh_token: string | null;
    expires_at: string | null;
};

/**
 * SOURCE UNIQUE de la logique de refresh des tokens POS (déduplique sync-engine
 * et getActivePosAccessToken, qui divergeaient). Déchiffre le token courant ;
 * s'il expire dans <5 min et qu'un refresh_token existe, rafraîchit via l'adapter,
 * persiste (chiffré) et retourne le token frais. Retourne null si le refresh
 * échoue (token révoqué) — le caller décide d'échouer ou de signaler.
 */
export async function ensureFreshAccessToken(
    supabase: SupabaseClient,
    conn: RefreshableConn,
    adapter: IPOSAdapter,
): Promise<string | null> {
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

    return accessToken;
}

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
    const accessToken = await ensureFreshAccessToken(supabase, conn, adapter);
    if (accessToken === null) return null; // refresh échoué (token révoqué)

    return {
        provider: conn.provider,
        accessToken,
        adapter,
        shopDomain: conn.shop_domain,
    };
}
