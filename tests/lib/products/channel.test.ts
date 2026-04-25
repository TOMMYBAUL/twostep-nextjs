import { describe, it, expect } from "vitest";
import { resolveChannel, splitProductIds } from "@/lib/products/channel";

describe("resolveChannel", () => {
    it("returns 'in_store' if merchant has no online presence", () => {
        expect(resolveChannel({ has_online_store: false })).toBe("in_store");
    });

    it("returns 'multi' if merchant has both online and physical", () => {
        expect(resolveChannel({ has_online_store: true })).toBe("multi");
    });
});

describe("splitProductIds", () => {
    it("splits product IDs for multi channel", () => {
        expect(splitProductIds("ABC123", "multi")).toEqual({
            online: "ABC123-online",
            in_store: "ABC123-instore",
        });
    });

    it("returns only online for online channel", () => {
        expect(splitProductIds("ABC123", "online")).toEqual({ online: "ABC123" });
    });

    it("returns only in_store for in_store channel", () => {
        expect(splitProductIds("ABC123", "in_store")).toEqual({ in_store: "ABC123" });
    });
});
