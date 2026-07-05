import { describe, it, expect, vi } from "vitest";

/**
 * Durcissement du chemin de PUBLICATION Google (audit 2026-07-04, Cluster A — prérequis pilote).
 *
 *  A2 — `googleMerchantFetch` réessaie 429/5xx (backoff borné, honore Retry-After) au lieu de
 *       jeter au 1er échec → un rate-limit sur le catalogue pilote ne fait plus échouer tout le run.
 *  A6 — timeout dur sur tout fetch Google (un socket pendu ne bloque plus le push entier).
 *  A7 — `refreshGoogleToken` distingue une RÉVOCATION explicite (400 invalid_grant → reconnexion
 *       réellement requise) d'un BLIP transitoire (réseau/5xx/config) → plus de faux « reconnexion
 *       requise » affiché au marchand sur un simple blip.
 *
 * Preuve SANS réseau : `fetchImpl` + `sleep` injectés (deps) → déterministe, pas d'horloge réelle.
 */

import {
    isRetryableStatus,
    computeBackoffMs,
    googleMerchantFetch,
    refreshGoogleToken,
    tokenRefreshFailureStatus,
} from "@/lib/google/merchant";

const noSleep = async () => {};
const half = () => 0.5;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

// ─── Helpers purs ───────────────────────────────────────────────────

describe("isRetryableStatus", () => {
    it("429 et 5xx = réessayables", () => {
        expect(isRetryableStatus(429)).toBe(true);
        expect(isRetryableStatus(500)).toBe(true);
        expect(isRetryableStatus(503)).toBe(true);
        expect(isRetryableStatus(599)).toBe(true);
    });
    it("2xx/4xx (hors 429) = NON réessayables", () => {
        expect(isRetryableStatus(200)).toBe(false);
        expect(isRetryableStatus(400)).toBe(false);
        expect(isRetryableStatus(401)).toBe(false);
        expect(isRetryableStatus(403)).toBe(false);
        expect(isRetryableStatus(404)).toBe(false);
    });
});

describe("computeBackoffMs", () => {
    it("honore Retry-After numérique (secondes → ms)", () => {
        expect(computeBackoffMs(0, "2")).toBe(2000);
        expect(computeBackoffMs(5, " 3 ")).toBe(3000);
    });
    it("borne Retry-After au plafond (anti-attente absurde)", () => {
        expect(computeBackoffMs(0, "9999", { cap: 60_000 })).toBe(60_000);
    });
    it("Retry-After non numérique → backoff exponentiel plein-jitter", () => {
        // base·2^attempt · random(0.5), borné au cap
        expect(computeBackoffMs(0, "Wed, 21 Oct 2026 07:28:00 GMT", { base: 500, random: half })).toBe(250);
        expect(computeBackoffMs(2, null, { base: 500, random: half })).toBe(1000);
    });
    it("sans Retry-After → aléa borné par base·2^attempt, plafonné au cap", () => {
        expect(computeBackoffMs(0, null, { base: 500, random: () => 0 })).toBe(0);
        expect(computeBackoffMs(1, null, { base: 500, random: () => 0.99 })).toBe(Math.floor(0.99 * 1000));
        // À grand `attempt`, base·2^attempt dépasse le cap → l'aléa reste borné à [0, cap].
        expect(computeBackoffMs(30, null, { base: 500, cap: 60_000, random: () => 0.999 })).toBe(
            Math.floor(0.999 * 60_000),
        );
        expect(computeBackoffMs(30, null, { base: 500, cap: 60_000, random: () => 0.999 })).toBeLessThanOrEqual(60_000);
    });
});

describe("tokenRefreshFailureStatus (A7 — message honnête)", () => {
    it("révoqué → message actionnable de reconnexion", () => {
        const s = tokenRefreshFailureStatus(true);
        expect(s.last_feed_status).toBe("error");
        expect(s.last_feed_error).toMatch(/reconnexion requise/i);
    });
    it("transitoire → message NON alarmant + réessai auto (jamais « reconnexion requise »)", () => {
        const s = tokenRefreshFailureStatus(false);
        expect(s.last_feed_error).toMatch(/temporairement/i);
        expect(s.last_feed_error).not.toMatch(/reconnexion requise/i);
    });
});

// ─── googleMerchantFetch (A2 retry + A6 timeout) ────────────────────

describe("googleMerchantFetch", () => {
    it("succès du 1er coup → renvoie le JSON, 1 seul appel, Bearer + signal posés", async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ foo: "bar" }));
        const out = await googleMerchantFetch("/x", "tok", undefined, { fetchImpl, sleep: noSleep });
        expect(out).toEqual({ foo: "bar" });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const init = fetchImpl.mock.calls[0][1] as RequestInit;
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
        expect(init.signal).toBeDefined(); // A6 : timeout posé
    });

    it("503 puis 200 → réessaie et réussit (sleep entre les deux)", async () => {
        const sleep = vi.fn(async () => {});
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse({ error: "busy" }, 503))
            .mockResolvedValueOnce(jsonResponse({ ok: 1 }, 200));
        const out = await googleMerchantFetch("/x", "tok", undefined, { fetchImpl, sleep, random: half });
        expect(out).toEqual({ ok: 1 });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledTimes(1);
    });

    it("429 avec Retry-After → attend la durée indiquée", async () => {
        const sleep = vi.fn(async () => {});
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "2" }))
            .mockResolvedValueOnce(jsonResponse({ ok: 1 }, 200));
        await googleMerchantFetch("/x", "tok", undefined, { fetchImpl, sleep });
        expect(sleep).toHaveBeenCalledWith(2000);
    });

    it("400 (non réessayable) → jette immédiatement, aucun retry", async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ message: "bad request" }, 400));
        await expect(
            googleMerchantFetch("/x", "tok", undefined, { fetchImpl, sleep: noSleep }),
        ).rejects.toThrow("bad request");
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("500 persistant → jette après 4 tentatives (1 + 3 retries)", async () => {
        const sleep = vi.fn(async () => {});
        const fetchImpl = vi.fn(async () => jsonResponse({ message: "boom" }, 500));
        await expect(
            googleMerchantFetch("/x", "tok", undefined, { fetchImpl, sleep, random: half }),
        ).rejects.toThrow("boom");
        expect(fetchImpl).toHaveBeenCalledTimes(4);
        expect(sleep).toHaveBeenCalledTimes(3);
    });

    it("erreur réseau/timeout puis succès → réessaie (les inserts sont idempotents)", async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockRejectedValueOnce(new Error("ECONNRESET"))
            .mockResolvedValueOnce(jsonResponse({ ok: 1 }));
        const out = await googleMerchantFetch("/x", "tok", undefined, { fetchImpl, sleep: noSleep });
        expect(out).toEqual({ ok: 1 });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("erreur réseau persistante → jette la dernière erreur après 4 tentatives", async () => {
        const fetchImpl = vi.fn(async () => {
            throw new Error("ETIMEDOUT");
        });
        await expect(
            googleMerchantFetch("/x", "tok", undefined, { fetchImpl, sleep: noSleep }),
        ).rejects.toThrow("ETIMEDOUT");
        expect(fetchImpl).toHaveBeenCalledTimes(4);
    });

    // Finding 1 (revue SF-hunter) : le retry ne doit jamais déborder le budget temps dur du cron
    // (kill Vercel avant l'écriture du statut = troncature silencieuse n°1).
    it("budget temps déjà épuisé → échoue SANS appeler fetch", async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({}));
        await expect(
            googleMerchantFetch("/x", "tok", undefined, { fetchImpl, sleep: noSleep, deadlineMs: 1000, now: () => 2000 }),
        ).rejects.toThrow(/deadline/i);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("503 mais pas de budget pour un backoff → échoue vite, sans dormir ni ré-essayer", async () => {
        const sleep = vi.fn(async () => {});
        const fetchImpl = vi.fn(async () => jsonResponse({ message: "busy" }, 503));
        // remaining=100 ms ; backoff attempt0 (base 500 × random 0.5) = 250 > 100 → pas de sleep, throw.
        await expect(
            googleMerchantFetch("/x", "tok", undefined, {
                fetchImpl,
                sleep,
                random: half,
                deadlineMs: 100,
                now: () => 0,
            }),
        ).rejects.toThrow("busy");
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });
});

// ─── refreshGoogleToken (A7 — révocation vs blip) ───────────────────

describe("refreshGoogleToken", () => {
    it("200 → { ok:true, tokens } (refresh_token conservé)", async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ access_token: "at", expires_in: 3600 }));
        const r = await refreshGoogleToken("rt", { fetchImpl, sleep: noSleep });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.tokens.access_token).toBe("at");
            expect(r.tokens.refresh_token).toBe("rt");
            expect(typeof r.tokens.expires_at).toBe("string");
        }
    });

    it("400 invalid_grant → { ok:false, revoked:true }, AUCUN retry", async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ error: "invalid_grant" }, 400));
        const r = await refreshGoogleToken("rt", { fetchImpl, sleep: noSleep });
        expect(r).toEqual({ ok: false, revoked: true });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("503 persistant → { ok:false, revoked:false } après retries (blip, PAS révocation)", async () => {
        const sleep = vi.fn(async () => {});
        const fetchImpl = vi.fn(async () => jsonResponse({}, 503));
        const r = await refreshGoogleToken("rt", { fetchImpl, sleep, random: half });
        expect(r).toEqual({ ok: false, revoked: false });
        expect(fetchImpl).toHaveBeenCalledTimes(4);
    });

    it("503 puis 200 → réessaie et réussit", async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse({}, 503))
            .mockResolvedValueOnce(jsonResponse({ access_token: "at", expires_in: 3600 }));
        const r = await refreshGoogleToken("rt", { fetchImpl, sleep: noSleep });
        expect(r.ok).toBe(true);
    });

    it("erreur réseau persistante → { ok:false, revoked:false } + cause préservée (blip, jamais reconnexion)", async () => {
        const fetchImpl = vi.fn(async () => {
            throw new Error("net down");
        });
        const r = await refreshGoogleToken("rt", { fetchImpl, sleep: noSleep });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.revoked).toBe(false);
            // Finding 2 : l'exception réseau réelle est conservée pour le diagnostic Sentry.
            expect(r.cause).toBeInstanceOf(Error);
            expect((r.cause as Error).message).toBe("net down");
        }
    });

    it("503 mais pas de budget pour un backoff → { ok:false, revoked:false } sans dormir (Finding 1)", async () => {
        const sleep = vi.fn(async () => {});
        const fetchImpl = vi.fn(async () => jsonResponse({}, 503));
        const r = await refreshGoogleToken("rt", { fetchImpl, sleep, random: half, deadlineMs: 100, now: () => 0 });
        expect(r).toMatchObject({ ok: false, revoked: false });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });

    it("400 non invalid_grant (invalid_client/config) → revoked:false (ne pas accuser le marchand)", async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ error: "invalid_client" }, 400));
        const r = await refreshGoogleToken("rt", { fetchImpl, sleep: noSleep });
        expect(r).toEqual({ ok: false, revoked: false });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
