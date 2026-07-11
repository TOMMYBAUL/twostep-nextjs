import { describe, expect, it, vi } from "vitest";
import {
    classifyProductStatus,
    summarizeProductStatuses,
    fetchProcessedProducts,
    buildDisapprovalAlerts,
    buildFeedRunRow,
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

describe("buildDisapprovalAlerts", () => {
    const issue = (code: string, severity = "DISAPPROVED", description = "") => ({ code, severity, description });

    it("emits one alert per disapproved product with offerId, carrying its issues", () => {
        const products: GoogleProcessedProduct[] = [
            { offerId: "ok", productStatus: { destinationStatuses: [{ approvedCountries: ["FR"] }] } },
            { offerId: "bad", productStatus: { destinationStatuses: [{ disapprovedCountries: ["FR"] }], itemLevelIssues: [issue("invalid_gtin", "DISAPPROVED", "GTIN invalide")] } },
        ];
        const alerts = buildDisapprovalAlerts(products, "merch-1");
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toEqual({
            merchant_id: "merch-1",
            product_id: "bad",
            type: "google_disapproved",
            detail: { issues: [{ code: "invalid_gtin", severity: "DISAPPROVED", description: "GTIN invalide" }] },
        });
    });

    it("skips disapproved products without an offerId (no traceable product_id)", () => {
        const products: GoogleProcessedProduct[] = [
            { productStatus: { destinationStatuses: [{ disapprovedCountries: ["FR"] }] } },
        ];
        expect(buildDisapprovalAlerts(products, "merch-1")).toEqual([]);
    });

    it("defaults missing issue fields and tolerates no issues", () => {
        const products: GoogleProcessedProduct[] = [
            { offerId: "bad", productStatus: { destinationStatuses: [{ disapprovedCountries: ["FR"] }] } },
        ];
        const alerts = buildDisapprovalAlerts(products, "m");
        expect(alerts[0].detail.issues).toEqual([]);
    });
});

describe("buildFeedRunRow (G2 — ligne google_feed_runs)", () => {
    const summary = (over: Partial<ReturnType<typeof summarizeProductStatuses>> = {}) => ({
        total: 10,
        served: 6,
        pending: 2,
        disapproved: 1,
        unknown: 1,
        disapprovedOfferIds: ["p-1"],
        issues: [] as Array<{ code: string; severity: string; description: string; count: number }>,
        ...over,
    });
    const RUN_AT = new Date("2026-07-11T06:00:23.000Z");

    it("projette les compteurs du summary, day + run_at dérivés du MÊME instant (UTC)", () => {
        const row = buildFeedRunRow(summary(), "m-1", RUN_AT);
        expect(row).toEqual({
            merchant_id: "m-1",
            day: "2026-07-11",
            run_at: "2026-07-11T06:00:23.000Z",
            total: 10,
            served: 6,
            pending: 2,
            disapproved: 1,
            unknown: 1,
            top_issues: [],
        });
    });

    it("borne top_issues au top-10 (ordre du summary = fréquence décroissante, conservé)", () => {
        const issues = Array.from({ length: 14 }, (_, i) => ({
            code: `issue_${i}`,
            severity: "DISAPPROVED",
            description: `desc ${i}`,
            count: 14 - i,
        }));
        const row = buildFeedRunRow(summary({ issues }), "m-1", RUN_AT);
        expect(row.top_issues).toHaveLength(10);
        expect(row.top_issues[0].code).toBe("issue_0");
        expect(row.top_issues[9].code).toBe("issue_9");
    });

    it("tronque les descriptions Google trop longues (jsonb borné), sans toucher les courtes", () => {
        const long = "x".repeat(500);
        const row = buildFeedRunRow(
            summary({
                issues: [
                    { code: "long", severity: "DISAPPROVED", description: long, count: 3 },
                    { code: "short", severity: "DEMOTED", description: "image floue", count: 1 },
                ],
            }),
            "m-1",
            RUN_AT,
        );
        expect(row.top_issues[0].description).toHaveLength(200);
        expect(row.top_issues[1].description).toBe("image floue");
    });

    it("forme UNIFORME : toutes les colonnes présentes même sur un run 100 % sain (0 issue)", () => {
        // Un upsert PostgREST écrit l'UNION des colonnes du lot — une forme variable
        // injecterait des null (cf. LESSONS). Toutes les clés doivent toujours exister.
        const row = buildFeedRunRow(summary({ disapproved: 0, served: 10, pending: 0, unknown: 0 }), "m-2", RUN_AT);
        expect(Object.keys(row).sort()).toEqual(
            ["day", "disapproved", "merchant_id", "pending", "run_at", "served", "top_issues", "total", "unknown"].sort(),
        );
    });
});
