import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRateLimiter } from "@/lib/ean/rate-limiter";

describe("Rate limiter", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it("allows requests under the limit", async () => {
        const limiter = createRateLimiter(5, 60_000); // 5 per minute
        for (let i = 0; i < 5; i++) {
            await limiter.acquire(); // should not throw
        }
    });

    it("delays requests over the limit", async () => {
        const limiter = createRateLimiter(2, 60_000); // 2 per minute
        await limiter.acquire();
        await limiter.acquire();
        const promise = limiter.acquire(); // should wait
        vi.advanceTimersByTime(60_000);
        await promise; // resolves after window resets
    });

    it("resets after the time window", async () => {
        const limiter = createRateLimiter(1, 1_000); // 1 per second
        await limiter.acquire();
        vi.advanceTimersByTime(1_001);
        await limiter.acquire(); // should not wait
    });
});
