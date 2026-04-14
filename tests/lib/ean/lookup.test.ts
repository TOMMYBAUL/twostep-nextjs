import { describe, expect, it } from "vitest";
import { parseUpcItemDbResponse } from "@/lib/ean/lookup";

describe("EAN lookup", () => {
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
        // photo_url is always null — Serper handles photos with better quality
        expect(result!.photo_url).toBeNull();
        expect(result!.category).toBe("shoes > athletic");
    });

    it("returns null for empty UPCitemdb response", () => {
        const result = parseUpcItemDbResponse({ items: [] });
        expect(result).toBeNull();
    });

    it("returns null for missing items array", () => {
        const result = parseUpcItemDbResponse({});
        expect(result).toBeNull();
    });

    it("handles item with minimal fields", () => {
        const result = parseUpcItemDbResponse({ items: [{ title: "Test Product" }] });
        expect(result).not.toBeNull();
        expect(result!.name).toBe("Test Product");
        expect(result!.brand).toBeNull();
        expect(result!.photo_url).toBeNull();
        expect(result!.category).toBeNull();
    });
});
