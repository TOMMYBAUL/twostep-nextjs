import { describe, expect, it } from "vitest";
import { parseOpenEanResponse } from "@/lib/ean/lookup";

describe("EAN lookup", () => {
    it("parses Open EAN Database response", () => {
        const response = {
            name: "Coca-Cola 33cl",
            brand: "Coca-Cola",
            image: "https://example.com/coca.jpg",
        };
        const result = parseOpenEanResponse(response);
        expect(result.name).toBe("Coca-Cola 33cl");
        expect(result.brand).toBe("Coca-Cola");
        expect(result.photo_url).toBe("https://example.com/coca.jpg");
    });

    it("handles missing fields", () => {
        const result = parseOpenEanResponse({ name: "Unknown Product" });
        expect(result.brand).toBeNull();
        expect(result.photo_url).toBeNull();
    });
});
