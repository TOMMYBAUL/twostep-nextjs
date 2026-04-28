import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    deleteVectorById,
    queryVector,
    upsertVectors,
} from "@/lib/enrichment/vectorize-client";

describe("vectorize-client", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        process.env.R2_ACCOUNT_ID = "acc_123";
        process.env.CLOUDFLARE_API_TOKEN = "cf_test_token";
        process.env.CLOUDFLARE_VECTORIZE_INDEX = "twostep-products-test";
    });

    describe("upsertVectors", () => {
        it("happy path : POST NDJSON, count returned", async () => {
            const fetchMock = vi.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    result: { count: 2, mutationId: "mut_abc" },
                }),
            });
            vi.stubGlobal("fetch", fetchMock);

            const result = await upsertVectors([
                { id: "p1", values: [0.1, 0.2], metadata: { brand: "Nike" } },
                { id: "p2", values: [0.3, 0.4] },
            ]);

            expect(result.count).toBe(2);

            // Vérifie l'URL et le body NDJSON
            expect(fetchMock).toHaveBeenCalledOnce();
            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe(
                "https://api.cloudflare.com/client/v4/accounts/acc_123/vectorize/v2/indexes/twostep-products-test/upsert",
            );
            expect(init.method).toBe("POST");
            expect(init.headers.Authorization).toBe("Bearer cf_test_token");
            // NDJSON : 2 lignes JSON séparées par \n
            expect(init.body.split("\n")).toHaveLength(2);
        });

        it("0 vectors → no-op, returns count 0", async () => {
            const fetchMock = vi.fn();
            vi.stubGlobal("fetch", fetchMock);
            const result = await upsertVectors([]);
            expect(result.count).toBe(0);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it("> 5000 vectors → throw (caller doit batch)", async () => {
            const tooMany = new Array(5001).fill(null).map((_, i) => ({
                id: `p${i}`,
                values: [0.1],
            }));
            await expect(upsertVectors(tooMany)).rejects.toThrow(/Too many vectors/);
        });

        it("API error → throw avec status", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
                ok: false,
                status: 403,
                text: async () => '{"error":"forbidden"}',
            }));

            await expect(upsertVectors([{ id: "p1", values: [0.1] }]))
                .rejects.toThrow(/Vectorize.*403/);
        });

        it("success=false dans body → throw", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: false,
                    errors: [{ message: "Invalid vector dim" }],
                    result: null,
                }),
            }));

            await expect(upsertVectors([{ id: "p1", values: [0.1] }]))
                .rejects.toThrow(/success=false/);
        });
    });

    describe("queryVector", () => {
        it("happy path : POST avec body, retourne matches", async () => {
            const mockMatches = [
                { id: "p1", score: 0.97, metadata: { brand: "Nike" } },
                { id: "p2", score: 0.92, metadata: { brand: "Nike" } },
            ];

            vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    result: { matches: mockMatches },
                }),
            }));

            const result = await queryVector([0.1, 0.2, 0.3], { topK: 5 });
            expect(result.matches).toHaveLength(2);
            expect(result.matches[0].score).toBe(0.97);
        });

        it("topK > 50 cappé à 50", async () => {
            const fetchMock = vi.fn().mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, result: { matches: [] } }),
            });
            vi.stubGlobal("fetch", fetchMock);

            await queryVector([0.1], { topK: 100 });
            const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
            expect(body.topK).toBe(50);
        });

        it("filter sur metadata transmis", async () => {
            const fetchMock = vi.fn().mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, result: { matches: [] } }),
            });
            vi.stubGlobal("fetch", fetchMock);

            await queryVector([0.1], { filter: { brand: "Nike" } });
            const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
            expect(body.filter).toEqual({ brand: "Nike" });
        });
    });

    describe("config", () => {
        it("R2_ACCOUNT_ID absent → throw clair", async () => {
            delete process.env.R2_ACCOUNT_ID;
            vi.stubGlobal("fetch", vi.fn());
            await expect(upsertVectors([{ id: "p1", values: [0.1] }]))
                .rejects.toThrow(/R2_ACCOUNT_ID/);
        });

        it("CLOUDFLARE_API_TOKEN absent → throw clair", async () => {
            delete process.env.CLOUDFLARE_API_TOKEN;
            vi.stubGlobal("fetch", vi.fn());
            await expect(upsertVectors([{ id: "p1", values: [0.1] }]))
                .rejects.toThrow(/CLOUDFLARE_API_TOKEN/);
        });
    });

    describe("deleteVectorById", () => {
        it("appelle l'endpoint delete-by-ids avec l'ID", async () => {
            const fetchMock = vi.fn().mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, result: { count: 1 } }),
            });
            vi.stubGlobal("fetch", fetchMock);

            await deleteVectorById("p1");
            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toContain("/delete-by-ids");
            expect(JSON.parse(init.body).ids).toEqual(["p1"]);
        });
    });
});
