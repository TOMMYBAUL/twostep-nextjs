import crypto from "crypto";
import { signState } from "@/lib/auth/state-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/email/encryption";
import { captureError } from "@/lib/error";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MERCHANT_API_BASE = "https://merchantapi.googleapis.com";

// ─── Résilience du chemin de publication Google (prérequis pilote live) ──────
// A6 : timeout dur sur tout fetch Google (un socket pendu bloquerait tout le push).
// A2 : réessai borné sur 429 (rate-limit) et 5xx (indispo transitoire) — sinon un
//      seul 429 sur le catalogue pilote fait échouer massivement le run ("partial").
const GOOGLE_FETCH_TIMEOUT_MS = 30_000;
const GOOGLE_MAX_RETRIES = 3; // → 4 tentatives au total
const GOOGLE_BACKOFF_BASE_MS = 500;
const GOOGLE_BACKOFF_CAP_MS = 60_000; // borne le Retry-After ET le backoff exponentiel

export type GoogleFetchDeps = {
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
    // Budget temps DUR partagé avec l'appelant (cron google-feed) : au-delà, on ne dort PAS et
    // on n'entame PAS un nouvel essai — sinon 4 essais × 30 s + 3 backoffs × 60 s (~300 s) pour
    // UN produit dépasseraient `maxDuration`/la marge de kill Vercel et le statut final ne
    // serait jamais écrit (troncature silencieuse n°1). Absent ⇒ pas de borne (Infinity).
    deadlineMs?: number;
    now?: () => number; // injectable pour les tests (défaut Date.now)
};

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Millisecondes restantes avant le budget dur ; Infinity si aucun budget n'est fourni. */
function remainingMs(deps: GoogleFetchDeps): number {
    if (deps.deadlineMs == null) return Infinity;
    return deps.deadlineMs - (deps.now ?? Date.now)();
}

/** 429 (rate-limit) et 5xx (indispo transitoire Google) = réessayables ; le reste (4xx) = non. */
export function isRetryableStatus(status: number): boolean {
    return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Délai avant le prochain essai. Honore `Retry-After` (secondes) si présent et numérique
 * (borné à `cap`), sinon backoff exponentiel plein-jitter (0..base·2^attempt, borné à `cap`).
 * `attempt` = index 0-based de la tentative qui vient d'échouer.
 */
export function computeBackoffMs(
    attempt: number,
    retryAfter: string | null,
    opts: { base?: number; cap?: number; random?: () => number } = {},
): number {
    const base = opts.base ?? GOOGLE_BACKOFF_BASE_MS;
    const cap = opts.cap ?? GOOGLE_BACKOFF_CAP_MS;
    const random = opts.random ?? Math.random;

    if (retryAfter != null && retryAfter.trim() !== "") {
        const secs = Number(retryAfter.trim());
        if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, cap);
    }

    // Full jitter (AWS) : aléa uniforme sur [0, ceil] → casse le thundering-herd si plusieurs
    // marchands/produits réessaient en phase. Borné par `cap`.
    const ceil = Math.min(base * 2 ** attempt, cap);
    return Math.min(Math.floor(random() * ceil), cap);
}

type GoogleTokens = {
    access_token: string;
    refresh_token: string;
    expires_at: string;
};

export type RefreshResult =
    | { ok: true; tokens: GoogleTokens }
    // `revoked` : Google a EXPLICITEMENT invalidé le refresh token (invalid_grant) → reconnexion
    // réellement requise. `false` = blip transitoire (réseau / 5xx / config) → surtout NE PAS
    // dire au marchand « reconnexion requise » (faux positif A7) ; réessai auto au prochain run.
    // `cause` : l'exception réseau réelle (ECONNRESET/TLS/DNS…) quand on l'a — préservée pour le
    // diagnostic Sentry (ne pas la jeter au profit d'un message générique).
    | { ok: false; revoked: boolean; cause?: unknown };

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
        state: signState(`google:${merchantId}:${crypto.randomUUID().slice(0, 8)}`),
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
        // A6 : timeout dur (un code d'autorisation est à usage unique → pas de retry ici).
        signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
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

export async function refreshGoogleToken(
    refreshToken: string,
    deps: GoogleFetchDeps = {},
): Promise<RefreshResult> {
    const fetchImpl = deps.fetchImpl ?? fetch;
    const sleep = deps.sleep ?? defaultSleep;
    const body = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
    });

    let lastError: unknown;
    for (let attempt = 0; attempt <= GOOGLE_MAX_RETRIES; attempt++) {
        const remaining = remainingMs(deps);
        if (remaining <= 0) return { ok: false, revoked: false, cause: lastError };

        let res: Response;
        try {
            res = await fetchImpl(GOOGLE_TOKEN_URL, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body,
                // A6 : timeout dur, jamais au-delà du budget restant.
                signal: AbortSignal.timeout(Math.min(GOOGLE_FETCH_TIMEOUT_MS, remaining)),
            });
        } catch (e) {
            // Blip réseau / timeout = TRANSITOIRE, jamais une révocation. On CONSERVE l'exception
            // réelle (Finding 2) pour le diagnostic Sentry côté appelant.
            lastError = e;
            const backoff = computeBackoffMs(attempt, null, { random: deps.random });
            if (attempt < GOOGLE_MAX_RETRIES && remainingMs(deps) > backoff) {
                await sleep(backoff);
                continue;
            }
            return { ok: false, revoked: false, cause: e };
        }

        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (res.ok) {
            return {
                ok: true,
                tokens: {
                    access_token: data.access_token as string,
                    refresh_token: refreshToken,
                    expires_at: new Date(Date.now() + (data.expires_in as number) * 1000).toISOString(),
                },
            };
        }

        // Révocation EXPLICITE de Google (400 invalid_grant) → reconnexion réellement requise.
        if (res.status === 400 && data.error === "invalid_grant") {
            return { ok: false, revoked: true };
        }
        // 429 / 5xx = transitoire → réessayer si des essais ET du budget temps restent.
        if (isRetryableStatus(res.status) && attempt < GOOGLE_MAX_RETRIES) {
            const backoff = computeBackoffMs(attempt, res.headers.get("retry-after"), { random: deps.random });
            if (remainingMs(deps) > backoff) {
                await sleep(backoff);
                continue;
            }
        }
        // Autre 4xx (invalid_client/config, etc.) OU 5xx sans budget de réessai : ni transitoire
        // réessayable, ni révocation imputable au marchand → NE PAS crier « reconnexion requise ».
        return { ok: false, revoked: false };
    }
    return { ok: false, revoked: false, cause: lastError };
}

/**
 * Statut HONNÊTE à écrire quand le rafraîchissement du jeton Google échoue (A7).
 * - révoqué → message ACTIONNABLE « reconnexion requise » ;
 * - transitoire → message NON alarmant + réessai auto au prochain run (jamais « reconnexion
 *   requise » sur un simple blip = faux positif qui pousse le marchand à re-connecter pour rien).
 */
export function tokenRefreshFailureStatus(revoked: boolean): {
    last_feed_status: "error";
    last_feed_error: string;
} {
    return {
        last_feed_status: "error",
        last_feed_error: revoked
            ? "Connexion Google révoquée — reconnexion requise"
            : "Rafraîchissement du jeton Google temporairement indisponible — nouvel essai automatique",
    };
}

export async function getGoogleAccessToken(
    merchantId: string,
    deps: GoogleFetchDeps = {},
): Promise<{
    accessToken: string;
    connection: GoogleConnection;
} | null> {
    const supabase = createAdminClient();

    const { data: conn, error: connErr } = await supabase
        .from("google_merchant_connections")
        .select("*")
        .eq("merchant_id", merchantId)
        .single();

    // E5 : un blip DB (≠ PGRST116 « 0 ligne ») ne doit pas passer pour « pas de connexion »
    // en silence → visible (Sentry), on saute ce marchand ce run (récupéré au suivant).
    if (connErr && (connErr as { code?: string }).code !== "PGRST116") {
        captureError(connErr, { fn: "getGoogleAccessToken", merchantId });
        return null;
    }
    if (!conn) return null;

    let accessToken = decrypt(conn.access_token);
    const expiresAt = new Date(conn.expires_at).getTime();
    const fiveMinFromNow = Date.now() + 5 * 60 * 1000;

    if (expiresAt < fiveMinFromNow) {
        const refreshed = await refreshGoogleToken(decrypt(conn.refresh_token), deps);
        if (!refreshed.ok) {
            // Statut HONNÊTE écrit ICI (source UNIQUE du message d'échec token) : révoqué →
            // « reconnexion requise » ; transitoire → réessai auto (pas d'alarme).
            await supabase
                .from("google_merchant_connections")
                .update(tokenRefreshFailureStatus(refreshed.revoked))
                .eq("id", conn.id);
            // Sentry DIFFÉRENCIÉ (Finding 3) : seul le blip TRANSITOIRE est un signal ops (avec la
            // cause réseau réelle, Finding 2). La révocation est un état ATTENDU, actionnable par le
            // marchand (statut DB = signal) → PAS de captureError à chaque run (bruit inutile).
            // getGoogleAccessToken est le seul émetteur → l'appelant (cron) ne double PLUS l'alerte.
            if (!refreshed.revoked) {
                captureError(
                    refreshed.cause instanceof Error
                        ? refreshed.cause
                        : new Error("Google token refresh transient failure"),
                    { fn: "getGoogleAccessToken", merchantId },
                );
            }
            return null;
        }

        // Finding 4 : ce write ne doit pas échouer en silence (discipline « tout write DB a un
        // chemin d'erreur honnête »). Impact faible (auto-guérison : le run suivant re-refresh le
        // même refresh_token non tourné), mais on le rend visible.
        const { error: persistErr } = await supabase
            .from("google_merchant_connections")
            .update({
                access_token: encrypt(refreshed.tokens.access_token),
                refresh_token: encrypt(refreshed.tokens.refresh_token),
                expires_at: refreshed.tokens.expires_at,
            })
            .eq("id", conn.id);
        if (persistErr) {
            captureError(persistErr, { fn: "getGoogleAccessToken", merchantId, step: "persist-refreshed-token" });
        }

        accessToken = refreshed.tokens.access_token;
    }

    return { accessToken, connection: conn };
}

// ─── Merchant API helpers ───────────────────────────────────────────

export async function googleMerchantFetch(
    path: string,
    accessToken: string,
    options?: RequestInit,
    deps: GoogleFetchDeps = {},
): Promise<Record<string, unknown>> {
    const fetchImpl = deps.fetchImpl ?? fetch;
    const sleep = deps.sleep ?? defaultSleep;
    const url = `${MERCHANT_API_BASE}${path}`;
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...options?.headers,
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= GOOGLE_MAX_RETRIES; attempt++) {
        const remaining = remainingMs(deps);
        // Budget dur épuisé → échec IMMÉDIAT (jamais entamer un essai qui déborderait le kill
        // Vercel avant l'écriture du statut = troncature silencieuse n°1, Finding 1).
        if (remaining <= 0) throw lastError ?? new Error("Google API deadline exceeded");

        let res: Response;
        try {
            res = await fetchImpl(url, {
                ...options,
                headers,
                // A6 : timeout dur, jamais au-delà du budget restant (sauf signal fourni par l'appelant).
                signal: options?.signal ?? AbortSignal.timeout(Math.min(GOOGLE_FETCH_TIMEOUT_MS, remaining)),
            });
        } catch (e) {
            // Erreur réseau / timeout (AbortSignal) = transitoire → réessayer.
            // Les inserts Merchant API sont idempotents (upsert par offerId) → réessai sûr.
            lastError = e instanceof Error ? e : new Error(String(e));
            const backoff = computeBackoffMs(attempt, null, { random: deps.random });
            if (attempt < GOOGLE_MAX_RETRIES && remainingMs(deps) > backoff) {
                await sleep(backoff);
                continue;
            }
            throw lastError;
        }

        if (res.ok) return res.json() as Promise<Record<string, unknown>>;

        // A2 : 429 / 5xx → backoff (honore Retry-After) puis réessai, tant qu'il reste des essais
        // ET du budget temps (sinon on échoue vite plutôt que de déborder le budget, Finding 1).
        if (isRetryableStatus(res.status) && attempt < GOOGLE_MAX_RETRIES) {
            const backoff = computeBackoffMs(attempt, res.headers.get("retry-after"), { random: deps.random });
            if (remainingMs(deps) > backoff) {
                await sleep(backoff);
                continue;
            }
        }

        // Non réessayable (4xx), essais épuisés, OU pas de budget pour attendre → échec HONNÊTE
        // (throw → statut "partial"/"error" en amont, jamais un faux "success").
        const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error((err.message as string) || `Google API error: ${res.status}`);
    }
    throw lastError ?? new Error("Google API error: retries exhausted");
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
