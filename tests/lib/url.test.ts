import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

describe("getSiteUrl", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
        delete process.env.NEXT_PUBLIC_SITE_URL;
        delete process.env.VERCEL_URL;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it("returns NEXT_PUBLIC_SITE_URL when set", async () => {
        process.env.NEXT_PUBLIC_SITE_URL = "https://twostep.fr";
        const { getSiteUrl } = await import("@/lib/url");
        expect(getSiteUrl()).toBe("https://twostep.fr");
    });

    it("falls back to VERCEL_URL with https prefix", async () => {
        process.env.VERCEL_URL = "twostep-abc123.vercel.app";
        const { getSiteUrl } = await import("@/lib/url");
        expect(getSiteUrl()).toBe("https://twostep-abc123.vercel.app");
    });

    it("falls back to localhost when no env vars set", async () => {
        const { getSiteUrl } = await import("@/lib/url");
        expect(getSiteUrl()).toBe("http://localhost:3000");
    });

    it("prefers NEXT_PUBLIC_SITE_URL over VERCEL_URL", async () => {
        process.env.NEXT_PUBLIC_SITE_URL = "https://twostep.fr";
        process.env.VERCEL_URL = "twostep-abc123.vercel.app";
        const { getSiteUrl } = await import("@/lib/url");
        expect(getSiteUrl()).toBe("https://twostep.fr");
    });
});
