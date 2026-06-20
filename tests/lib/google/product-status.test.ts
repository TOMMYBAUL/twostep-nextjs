import { describe, expect, it, vi } from "vitest";
import {
    classifyProductStatus,
    summarizeProductStatuses,
    fetchProcessedProducts,
    type GoogleProcessedProduct,
    type GoogleProductStatus,
} from "@/lib/google/product-status";

const dest = (k: "approved" | "pending" | "disapproved", countries = ["FR"]) => ({
    reportingContext: "SHOPPING_ADS",
    approvedCountries: k === "approved" ? countries : [],
    pendingCountries: k === "pending" ? countries : [],
    disapprovedCountries: k === "disapproved" ? countries : [],
});

describe("classifyProductStatus", () => {
    it("returns unknown when no destinationStatuses", () => {
        expect(classifyProductStatus(undefined)).toBe("unknown");
        expect(classifyProductStatus({})).toBe("unknown");
        expect(classifyProductStatus({ destinationStatuses: [] })).toBe("unknown");
    });

    it("returns served when at least one destination approves", () => {
        expect(classifyProductStatus({ destinationStatuses: [dest("approved")] })).toBe("served");
    });

    it("returns pending when only pending", () => {
        expect(classifyProductStatus({ destinationStatuses: [dest("pending")] })).toBe("pending");
    });

    it("returns disapproved when any destination disapproves", () => {
        expect(classifyProductStatus({ destinationStatuses: [dest("disapproved")] })).toBe("disapproved");
    });

    it("disapproval wins over approval (mixed destinations)", () => {
        // Servi en Belgique mais rejeté en France → rejeté (faux positif potentiel chez nous).
        const status: GoogleProductStatus = {
            destinationStatuses: [dest("approved", ["BE"]), dest("disapproved", ["FR"])],
        };
        expect(classifyProductStatus(status)).toBe("disapproved");
    });

    it("tolerates missing country arrays (defensive)", () => {
        expect(classifyProductStatus({ destinationStatuses: [{ reportingContext: "SHOPPING_ADS" }] })).toBe("unknown");
    });
});

describe("summarizeProductStatuses", () => {
    it("handles empty list", () => {
        const s = summarizeProductStatuses([]);
        expect(s).toEqual({
            total: 0,
            disapproved: 0,
            served: 0,
            pending: 0,
            unknown: 0,
            disapprovedOfferIds: [],
            issues: [],
        });
    });

    it("counts each verdict and collects disapproved offerIds", () => {
        const products: GoogleProcessedProduct[] = [
            { offerId: "a", productStatus: { destinationStatuses: [dest("approved")] } },
            { offerId: "b", productStatus: { destinationStatuses: [dest("pending")] } },
            { offerId: "c", productStatus: { destinationStatuses: [dest("disapproved")] } },
            { offerId: "d", productStatus: { destinationStatuses: [dest("disapproved")] } },
            { offerId: "e", productStatus: {} }, // unknown
            { offerId: "f" }, // no productStatus → unknown
        ];
        const s = summarizeProductStatuses(products);
        expect(s.total).toBe(6);
        expect(s.served).toBe(1);
        expect(s.pending).toBe(1);
        expect(s.disapproved).toBe(2);
        expect(s.unknown).toBe(2);
        expect(s.disapprovedOfferIds).toEqual(["c", "d"]);
    });

    it("aggregates itemLevelIssues by code, sorted by frequency desc", () => {
        const issue = (code: string, severity: string) => ({ code, severity, description: `${code} desc` });
        const products: GoogleProcessedProduct[] = [
            { offerId: "a", productStatus: { destinationStatuses: [dest("disapproved")], itemLevelIssues: [issue("image_link_pending_crawl", "DEMOTED"), issue("invalid_gtin", "DISAPPROVED")] } },
            { offerId: "b", productStatus: { destinationStatuses: [dest("disapproved")], itemLevelIssues: [issue("invalid_gtin", "DISAPPROVED")] } },
            { offerId: "c", productStatus: { destinationStatuses: [dest("disapproved")], itemLevelIssues: [issue("invalid_gtin", "DISAPPROVED")] } },
        ];
        const s = summarizeProductStatuses(products);
        expect(s.issues).toHaveLength(2);
        expect(s.issues[0]).toEqual({ code: "invalid_gtin", severity: "DISAPPROVED", description: "invalid_gtin desc", count: 3 });
        expect(s.issues[1].code).toBe("image_link_pending_crawl");
        expect(s.issues[1].count).toBe(1);
    });

    it("defaults missing issue code/severity/description", () => {
        const products: GoogleProcessedProduct[] = [
            { offerId: "a", productStatus: { destinationStatuses: [dest("disapproved")], itemLevelIssues: [{}] } },
        ];
        const s = summarizeProductStatuses(products);
        expect(s.issues[0]).toEqual({ code: "unknown", severity: "SEVERITY_UNSPECIFIED", description: "", count: 1 });
    });

    it("does not push offerId when absent for a disapproved product", () => {
        const products: GoogleProcessedProduct[] = [
            { productStatus: { destinationStatuses: [dest("disapproved")] } },
        ];
        const s = summarizeProductStatuses(products);
        expect(s.disapproved).toBe(1);
        expect(s.disapprovedOfferIds).toEqual([]);
    });
});

describe("fetchProcessedProducts", () => {
    it("paginates until nextPageToken is exhausted", async () => {
        const fetchPage = vi
            .fn()
            .mockResolvedValueOnce({ products: [{ offerId: "a" }, { offerId: "b" }], nextPageToken: "tok2" })
            .mockResolvedValueOnce({ products: [{ offerId: "c" }] }); // no token → stop

        const out = await fetchProcessedProducts("at", "1234567", { fetchPage });
        expect(out.map((p) => p.offerId)).toEqual(["a", "b", "c"]);
        expect(fetchPage).toHaveBeenCalledTimes(2);

        // 1re page sans pageToken, 2e page avec.
        expect(fetchPage.mock.calls[0][0]).toBe("/products/v1beta/accounts/1234567/products?pageSize=250");
        expect(fetchPage.mock.calls[1][0]).toContain("pageToken=tok2");
        expect(fetchPage.mock.calls[0][1]).toBe("at");
    });

    it("returns [] when API returns no products array", async () => {
        const fetchPage = vi.fn().mockResolvedValue({});
        const out = await fetchProcessedProducts("at", "1", { fetchPage });
        expect(out).toEqual([]);
        expect(fetchPage).toHaveBeenCalledTimes(1);
    });

    it("throws if a repeating cursor would loop past the page limit", async () => {
        // Curseur qui se répète à l'infini → la garde doit lever, pas tourner sans fin.
        const fetchPage = vi.fn().mockResolvedValue({ products: [{ offerId: "x" }], nextPageToken: "same" });
        process.env.GOOGLE_STATUS_MAX_PAGES = "3";
        await expect(fetchProcessedProducts("at", "loopy", { fetchPage })).rejects.toThrow(/limite de 3 pages/);
        expect(fetchPage).toHaveBeenCalledTimes(3);
        delete process.env.GOOGLE_STATUS_MAX_PAGES;
    });

    it("propagates a hard API error (anti silent failure)", async () => {
        const fetchPage = vi.fn().mockRejectedValue(new Error("Google API error: 503"));
        await expect(fetchProcessedProducts("at", "1", { fetchPage })).rejects.toThrow("Google API error: 503");
    });
});
