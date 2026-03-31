import { describe, expect, it } from "vitest";
import { selectProductsToEnrich, enrichNewProducts } from "@/lib/ean/enrich";

describe("enrich module", () => {
    it("exports selectProductsToEnrich", () => {
        expect(typeof selectProductsToEnrich).toBe("function");
    });

    it("exports enrichNewProducts", () => {
        expect(typeof enrichNewProducts).toBe("function");
    });
});
