import { describe, expect, it, vi } from "vitest";
import { parseOpenEanResponse, parseUpcItemDbResponse } from "@/lib/ean/lookup";

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

    it("parses UPCitemdb paid API response", () => {
        const response = {
            items: [{
                title: "New Balance 574 Core Grey",
                brand: "New Balance",
                images: ["https://example.com/nb574.jpg", "https://example.com/nb574-2.jpg"],
                category: "Shoes > Athletic",
            }],
        };
        const result = parseUpcItemDbResponse(response);
        expect(result).not.toBeNull();
        expect(result!.name).toBe("New Balance 574 Core Grey");
        expect(result!.brand).toBe("New Balance");
        expect(result!.photo_url).toBe("https://example.com/nb574.jpg");
        expect(result!.category).toBe("shoes > athletic");
    });

    it("returns null for empty UPCitemdb response", () => {
        const result = parseUpcItemDbResponse({ items: [] });
        expect(result).toBeNull();
    });
});
