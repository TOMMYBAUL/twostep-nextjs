import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/email/encryption";
import { captureError } from "@/lib/error";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MERCHANT_API_BASE = "https://merchantapi.googleapis.com";

type GoogleTokens = {
    access_token: string;
    refresh_token: string;
    expires_at: string;
};

type GoogleConnection = {
    id: string;
    merchant_id: string;
    google_merchant_id: string;
    access_token: string;
    refresh_token: string;
    expires_at: string;
    store_code: string;
};

// ─── OAuth ──────────────────────────────────────────────────────────

export function getGoogleAuthUrl(merchantId: string): string {
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/content",
        access_type: "offline",
        prompt: "consent",
        state: `google:${merchantId}`,
    });
    return `${GOOGLE_AUTH_URL}?${params}`;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokens> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
            grant_type: "authorization_code",
        }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.error || "Google OAuth failed");

    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
}

// ─── Token management ───────────────────────────────────────────────

export async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokens | null> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            grant_type: "refresh_token",
        }),
    });

    const data = await res.json();
    if (!res.ok) return null;

    return {
        access_token: data.access_token,
        refresh_token: refreshToken,
        expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
}

export async function getGoogleAccessToken(merchantId: string): Promise<{
    accessToken: string;
    connection: GoogleConnection;
} | null> {
    const supabase = createAdminClient();

    const { data: conn } = await supabase
        .from("google_merchant_connections")
        .select("*")
        .eq("merchant_id", merchantId)
        .single();

    if (!conn) return null;

    let accessToken = decrypt(conn.access_token);
    const expiresAt = new Date(conn.expires_at).getTime();
    const fiveMinFromNow = Date.now() + 5 * 60 * 1000;

    if (expiresAt < fiveMinFromNow) {
        const refreshed = await refreshGoogleToken(decrypt(conn.refresh_token));
        if (!refreshed) {
            await supabase
                .from("google_merchant_connections")
                .update({ last_feed_status: "error", last_feed_error: "Token expired" })
                .eq("id", conn.id);
            return null;
        }

        await supabase
            .from("google_merchant_connections")
            .update({
                access_token: encrypt(refreshed.access_token),
                refresh_token: encrypt(refreshed.refresh_token),
                expires_at: refreshed.expires_at,
            })
            .eq("id", conn.id);

        accessToken = refreshed.access_token;
    }

    return { accessToken, connection: conn };
}

// ─── Merchant API helpers ───────────────────────────────────────────

export async function googleMerchantFetch(
    path: string,
    accessToken: string,
    options?: RequestInit,
): Promise<Record<string, unknown>> {
    const res = await fetch(`${MERCHANT_API_BASE}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...options?.headers,
        },
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as Record<string, unknown>).message as string || `Google API error: ${res.status}`);
    }

    return res.json();
}

export async function getGoogleMerchantId(accessToken: string): Promise<string> {
    const data = await googleMerchantFetch(
        "/accounts/v1beta/accounts",
        accessToken,
    );
    const accounts = data.accounts as Array<Record<string, string>> | undefined;
    if (!accounts || accounts.length === 0) {
        throw new Error("No Google Merchant Center account found");
    }
    return accounts[0].name.replace("accounts/", "");
}
