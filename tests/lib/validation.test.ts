import { describe, it, expect } from "vitest";
import {
    geoSchema,
    searchQuery,
    discoverQuery,
    autocompleteQuery,
    favoriteBody,
    followBody,
    productBody,
    promotionBody,
    parseQuery,
} from "@/lib/validation";

describe("geoSchema", () => {
    it("accepts valid lat/lng/radius", () => {
        const result = geoSchema.safeParse({ lat: "43.6", lng: "1.44", radius: "5" });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.lat).toBe(43.6);
            expect(result.data.lng).toBe(1.44);
            expect(result.data.radius).toBe(5);
        }
    });

    it("applies default radius=10", () => {
        const result = geoSchema.safeParse({ lat: "43.6", lng: "1.44" });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.radius).toBe(10);
    });

    it("rejects lat out of range", () => {
        expect(geoSchema.safeParse({ lat: "91", lng: "0" }).success).toBe(false);
        expect(geoSchema.safeParse({ lat: "-91", lng: "0" }).success).toBe(false);
    });

    it("rejects lng out of range", () => {
        expect(geoSchema.safeParse({ lat: "0", lng: "181" }).success).toBe(false);
    });

    it("rejects radius > 50", () => {
        expect(geoSchema.safeParse({ lat: "0", lng: "0", radius: "51" }).success).toBe(false);
    });
});

describe("searchQuery", () => {
    it("accepts valid search", () => {
        const result = searchQuery.safeParse({ q: "nike", lat: "43.6", lng: "1.44" });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.q).toBe("nike");
            expect(result.data.radius).toBe(5);
            expect(result.data.limit).toBe(50);
        }
    });

    it("rejects query > 200 chars", () => {
        const result = searchQuery.safeParse({ q: "x".repeat(201), lat: "0", lng: "0" });
        expect(result.success).toBe(false);
    });
});

describe("discoverQuery", () => {
    it("accepts valid section", () => {
        const result = discoverQuery.safeParse({ section: "promos", lat: "43.6", lng: "1.44" });
        expect(result.success).toBe(true);
    });

    it("rejects invalid section", () => {
        const result = discoverQuery.safeParse({ section: "invalid", lat: "43.6", lng: "1.44" });
        expect(result.success).toBe(false);
    });
});

describe("autocompleteQuery", () => {
    it("accepts short query", () => {
        expect(autocompleteQuery.safeParse({ q: "nik" }).success).toBe(true);
    });

    it("defaults q to empty string", () => {
        const result = autocompleteQuery.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.q).toBe("");
    });
});

describe("favoriteBody", () => {
    it("accepts valid UUID", () => {
        expect(favoriteBody.safeParse({ product_id: "550e8400-e29b-41d4-a716-446655440000" }).success).toBe(true);
    });

    it("rejects non-UUID", () => {
        expect(favoriteBody.safeParse({ product_id: "not-a-uuid" }).success).toBe(false);
    });
});

describe("followBody", () => {
    it("accepts valid UUID", () => {
        expect(followBody.safeParse({ merchant_id: "550e8400-e29b-41d4-a716-446655440000" }).success).toBe(true);
    });

    it("rejects missing merchant_id", () => {
        expect(followBody.safeParse({}).success).toBe(false);
    });
});

describe("productBody", () => {
    it("accepts minimal product", () => {
        expect(productBody.safeParse({ name: "Nike Air Max" }).success).toBe(true);
    });

    it("rejects empty name", () => {
        expect(productBody.safeParse({ name: "" }).success).toBe(false);
    });

    it("rejects negative price", () => {
        expect(productBody.safeParse({ name: "Test", price: -10 }).success).toBe(false);
    });
});

describe("promotionBody", () => {
    it("accepts valid promotion", () => {
        const result = promotionBody.safeParse({
            product_id: "550e8400-e29b-41d4-a716-446655440000",
            sale_price: 29.99,
        });
        expect(result.success).toBe(true);
    });

    it("rejects zero sale_price", () => {
        const result = promotionBody.safeParse({
            product_id: "550e8400-e29b-41d4-a716-446655440000",
            sale_price: 0,
        });
        expect(result.success).toBe(false);
    });
});

describe("parseQuery", () => {
    it("parses valid URLSearchParams", () => {
        const params = new URLSearchParams("lat=43.6&lng=1.44&radius=5");
        const result = parseQuery(params, geoSchema);
        expect("data" in result).toBe(true);
        if ("data" in result) {
            expect(result.data.lat).toBe(43.6);
        }
    });

    it("returns error for invalid params", () => {
        const params = new URLSearchParams("lat=999&lng=1.44");
        const result = parseQuery(params, geoSchema);
        expect("error" in result).toBe(true);
    });

    it("ignores extra params not in schema", () => {
        const params = new URLSearchParams("lat=43.6&lng=1.44&extraField=bad");
        const result = parseQuery(params, geoSchema);
        expect("data" in result).toBe(true);
    });
});
