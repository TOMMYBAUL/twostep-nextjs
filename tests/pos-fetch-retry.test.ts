import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithRetry, backoffDelay, parseRetryAfter } from "@/lib/pos/fetch-retry";

// Collecte ② passe 2 — back-off 429/5xx. sleep injecté = tests instantanés.

afterEach(() => {
    vi.unstubAllGlobals();
});

function res(status: number, headers: Record<string, string> = {}): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
        json: async () => ({}),
        text: async () => "",
    } as unknown as Response;
}

const noSleep = () => Promise.resolve();
const noJitter = () => 0.5; // jitter neutre (delta = 0)

describe("fetchWithRetry", () => {
    it("rend immédiatement une 200 (1 seul appel)", async () => {
        const fetchMock = vi.fn(async () => res(200));
        vi.stubGlobal("fetch", fetchMock);
        const r = await fetchWithRetry("http://x", undefined, { sleep: noSleep });
        expect(r.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("retente sur 429 puis réussit", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(res(429))
            .mockResolvedValueOnce(res(200));
        vi.stubGlobal("fetch", fetchMock);
        const r = await fetchWithRetry("http://x", undefined, { sleep: noSleep });
        expect(r.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("respecte Retry-After (secondes) pour la durée de pause", async () => {
        const sleeps: number[] = [];
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(res(429, { "retry-after": "3" }))
            .mockResolvedValueOnce(res(200));
        vi.stubGlobal("fetch", fetchMock);
        await fetchWithRetry("http://x", undefined, { sleep: async (ms) => void sleeps.push(ms) });
        expect(sleeps).toEqual([3000]);
    });

    it("retente sur 5xx", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(res(503))
            .mockResolvedValueOnce(res(502))
            .mockResolvedValueOnce(res(200));
        vi.stubGlobal("fetch", fetchMock);
        const r = await fetchWithRetry("http://x", undefined, { sleep: noSleep, jitter: noJitter });
        expect(r.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("après maxRetries, rend la dernière réponse (le caller décidera via res.ok)", async () => {
        const fetchMock = vi.fn(async () => res(429));
        vi.stubGlobal("fetch", fetchMock);
        const r = await fetchWithRetry("http://x", undefined, { sleep: noSleep, maxRetries: 2 });
        expect(r.status).toBe(429);
        expect(fetchMock).toHaveBeenCalledTimes(3); // 1 essai + 2 retries
    });

    it("retente une erreur réseau puis relance si elle persiste", async () => {
        const fetchMock = vi.fn(async () => {
            throw new Error("ECONNRESET");
        });
        vi.stubGlobal("fetch", fetchMock);
        await expect(
            fetchWithRetry("http://x", undefined, { sleep: noSleep, maxRetries: 2 }),
        ).rejects.toThrow(/ECONNRESET/);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("ne retente PAS une 4xx non-429 (ex. 404)", async () => {
        const fetchMock = vi.fn(async () => res(404));
        vi.stubGlobal("fetch", fetchMock);
        const r = await fetchWithRetry("http://x", undefined, { sleep: noSleep });
        expect(r.status).toBe(404);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("parseRetryAfter", () => {
    it("parse des secondes", () => {
        expect(parseRetryAfter("5", 0)).toBe(5000);
    });
    it("parse une date HTTP relative à now", () => {
        const now = Date.parse("2026-01-01T00:00:00Z");
        expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:10 GMT", now)).toBe(10000);
    });
    it("retourne null sur valeur absente/invalide", () => {
        expect(parseRetryAfter(null, 0)).toBeNull();
        expect(parseRetryAfter("garbage", 0)).toBeNull();
    });
});

describe("backoffDelay", () => {
    it("croît exponentiellement et plafonne", () => {
        expect(backoffDelay(0, 500, 8000, () => 0.5)).toBe(500);
        expect(backoffDelay(1, 500, 8000, () => 0.5)).toBe(1000);
        expect(backoffDelay(2, 500, 8000, () => 0.5)).toBe(2000);
        expect(backoffDelay(10, 500, 8000, () => 0.5)).toBe(8000); // plafonné
    });
});
