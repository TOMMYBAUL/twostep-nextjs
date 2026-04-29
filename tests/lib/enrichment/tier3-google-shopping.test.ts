import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lookupGoogleShopping } from "@/lib/enrichment/tier3-google-shopping";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.SERPER_API_KEY;

beforeEach(() => {
    process.env.SERPER_API_KEY = "test_key";
});

afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_KEY === undefined) {
        delete process.env.SERPER_API_KEY;
    } else {
        process.env.SERPER_API_KEY = ORIGINAL_KEY;
    }
    vi.restoreAllMocks();
});

function mockFetchOnce(json: unknown, ok = true) {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok,
        json: async () => json,
    } as Response);
}

describe("lookupGoogleShopping", () => {
    it("returns null if SERPER_API_KEY missing", async () => {
        delete process.env.SERPER_API_KEY;
        const result = await lookupGoogleShopping({ ean: "0884776073143" });
        expect(result).toBeNull();
    });

    it("returns null if no input provided", async () => {
        const result = await lookupGoogleShopping({});
        expect(result).toBeNull();
    });

    it("queries by EAN with strong confidence when EAN provided", async () => {
        mockFetchOnce({
            shopping: [
                {
                    title: "Nike Air Max 90",
                    source: "Nike.com",
                    link: "https://nike.com/airmax90",
                    price: "129,99 €",
                    imageUrl: "https://nike.com/airmax90.jpg",
                },
            ],
        });

        const result = await lookupGoogleShopping({ ean: "0884776073143" });
        expect(result).not.toBeNull();
        expect(result?.confidence).toBe("strong");
        expect(result?.canonical_name).toBe("Nike Air Max 90");
        expect(result?.photo_url).toBe("https://nike.com/airmax90.jpg");
        expect(result?.price).toBe(129.99);

        // Verify that fetch was called with the EAN as query
        const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
        const callArgs = fetchMock.mock.calls[0];
        expect(callArgs[0]).toBe("https://google.serper.dev/shopping");
        const body = JSON.parse((callArgs[1] as RequestInit).body as string);
        expect(body.q).toBe("0884776073143");
    });

    it("queries by brand+name with weak confidence when EAN absent", async () => {
        mockFetchOnce({
            shopping: [
                {
                    title: "Adidas Stan Smith Originals",
                    imageUrl: "https://adidas.com/stansmith.jpg",
                    price: "99.90",
                },
            ],
        });

        const result = await lookupGoogleShopping({
            name: "Stan Smith Originals",
            brand: "Adidas",
        });
        expect(result?.confidence).toBe("weak");
        expect(result?.brand).toBe("Adidas"); // Pour weak, on garde la brand input

        const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
        const body = JSON.parse(
            (fetchMock.mock.calls[0][1] as RequestInit).body as string,
        );
        expect(body.q).toBe("Adidas Stan Smith Originals");
    });

    it("returns null when shopping array is empty", async () => {
        mockFetchOnce({ shopping: [] });
        const result = await lookupGoogleShopping({ ean: "0884776073143" });
        expect(result).toBeNull();
    });

    it("returns null on non-OK HTTP response", async () => {
        mockFetchOnce({}, false);
        const result = await lookupGoogleShopping({ ean: "0884776073143" });
        expect(result).toBeNull();
    });

    it("parses french price format with euro symbol", async () => {
        mockFetchOnce({
            shopping: [{ title: "Test", price: "210,00 €" }],
        });
        const result = await lookupGoogleShopping({ ean: "1234567890123" });
        expect(result?.price).toBe(210);
    });

    it("parses USD price with comma thousands and dot decimal", async () => {
        mockFetchOnce({
            shopping: [{ title: "Test", price: "$1,299.00" }],
        });
        const result = await lookupGoogleShopping({ ean: "1234567890123" });
        expect(result?.price).toBe(1299);
    });

    it("returns null price when price string is unparseable", async () => {
        mockFetchOnce({
            shopping: [{ title: "Test", price: "Sur demande" }],
        });
        const result = await lookupGoogleShopping({ ean: "1234567890123" });
        expect(result?.price).toBeNull();
    });

    it("rejects EAN shorter than 8 chars", async () => {
        mockFetchOnce({ shopping: [{ title: "Test" }] });
        const result = await lookupGoogleShopping({ ean: "1234567" });
        // EAN trop court → ne tombe pas dans la branche EAN, et pas de
        // brand/name fourni non plus → return null sans fetch
        expect(result).toBeNull();
    });
});
