import { describe, it, expect, vi, beforeEach } from "vitest";

// Force in-memory mode by ensuring Upstash env vars are absent
vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

describe("rateLimit (in-memory fallback)", () => {
    let rateLimit: typeof import("@/lib/rate-limit").rateLimit;

    beforeEach(async () => {
        vi.resetModules();
        const mod = await import("@/lib/rate-limit");
        rateLimit = mod.rateLimit;
    });

    it("allows requests under the limit", async () => {
        const result = await rateLimit("127.0.0.1", "test-endpoint", 5);
        expect(result).toBeNull();
    });

    it("allows up to maxRequests", async () => {
        for (let i = 0; i < 5; i++) {
            const result = await rateLimit("127.0.0.2", "test-max", 5);
            expect(result).toBeNull();
        }
    });

    it("blocks after maxRequests exceeded", async () => {
        for (let i = 0; i < 3; i++) {
            await rateLimit("127.0.0.3", "test-block", 3);
        }
        const blocked = await rateLimit("127.0.0.3", "test-block", 3);
        expect(blocked).not.toBeNull();
        expect(blocked!.status).toBe(429);
    });

    it("returns Retry-After header on 429", async () => {
        for (let i = 0; i < 2; i++) {
            await rateLimit("127.0.0.4", "test-retry", 2);
        }
        const blocked = await rateLimit("127.0.0.4", "test-retry", 2);
        expect(blocked).not.toBeNull();
        const retryAfter = blocked!.headers.get("Retry-After");
        expect(retryAfter).toBeTruthy();
        expect(Number(retryAfter)).toBeGreaterThan(0);
    });

    it("isolates different endpoints", async () => {
        for (let i = 0; i < 2; i++) {
            await rateLimit("127.0.0.5", "endpoint-a", 2);
        }
        // Different endpoint should not be blocked
        const result = await rateLimit("127.0.0.5", "endpoint-b", 2);
        expect(result).toBeNull();
    });

    it("isolates different IPs", async () => {
        for (let i = 0; i < 2; i++) {
            await rateLimit("10.0.0.1", "test-ip", 2);
        }
        // Different IP should not be blocked
        const result = await rateLimit("10.0.0.2", "test-ip", 2);
        expect(result).toBeNull();
    });

    it("handles null IP gracefully", async () => {
        const result = await rateLimit(null, "test-null-ip", 5);
        expect(result).toBeNull();
    });
});
