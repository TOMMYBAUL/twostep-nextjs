import { describe, expect, it } from "vitest";
import { computeFeedScore } from "@/lib/feed/score";

describe("Feed score", () => {
    it("scores nearby + fresh items highest", () => {
        const score = computeFeedScore(0.5, 0, 1.0);
        expect(score).toBeCloseTo(2.0, 1);
    });

    it("applies minimum distance of 0.1km", () => {
        const score = computeFeedScore(0.0, 0, 1.0);
        expect(score).toBeCloseTo(10.0, 1);
    });

    it("decays with age", () => {
        const today = computeFeedScore(1.0, 0, 1.0);
        const yesterday = computeFeedScore(1.0, 1, 1.0);
        const lastWeek = computeFeedScore(1.0, 7, 1.0);

        expect(today).toBeGreaterThan(yesterday);
        expect(yesterday).toBeGreaterThan(lastWeek);
    });

    it("applies category boost", () => {
        const normal = computeFeedScore(1.0, 0, 1.0);
        const boosted = computeFeedScore(1.0, 0, 1.5);

        expect(boosted).toBe(normal * 1.5);
    });

    it("freshness: today=1.0, yesterday=0.5, 2days=0.33", () => {
        const freshness0 = 1 / (0 + 1);
        const freshness1 = 1 / (1 + 1);
        const freshness2 = 1 / (2 + 1);

        expect(freshness0).toBe(1.0);
        expect(freshness1).toBe(0.5);
        expect(freshness2).toBeCloseTo(0.333, 2);
    });
});
