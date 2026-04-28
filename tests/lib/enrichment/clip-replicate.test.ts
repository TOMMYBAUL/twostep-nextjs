import { describe, it, expect, vi, beforeEach } from "vitest";
import { embedImageViaReplicate } from "@/lib/enrichment/clip-replicate";

describe("embedImageViaReplicate", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        process.env.REPLICATE_API_TOKEN = "r8_test_token";
    });

    it("throws si REPLICATE_API_TOKEN absent", async () => {
        delete process.env.REPLICATE_API_TOKEN;
        await expect(embedImageViaReplicate("https://example.com/photo.jpg"))
            .rejects.toThrow("REPLICATE_API_TOKEN not configured");
    });

    it("happy path : create + poll succeed → retourne embedding 768 dims", async () => {
        const mockEmbedding = new Array(768).fill(0).map((_, i) => i / 768);

        const fetchMock = vi.fn()
            // 1er call : POST /predictions → renvoie prediction id
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    id: "pred_123",
                    status: "starting",
                    urls: { get: "https://api.replicate.com/v1/predictions/pred_123" },
                }),
            })
            // 2e call : GET poll → succeeded avec output
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    status: "succeeded",
                    output: [{ input: "https://example.com/photo.jpg", embedding: mockEmbedding }],
                }),
            });

        vi.stubGlobal("fetch", fetchMock);

        const result = await embedImageViaReplicate("https://example.com/photo.jpg");
        expect(result.embedding).toHaveLength(768);
        expect(result.embedding).toEqual(mockEmbedding);
        expect(result.model).toContain("replicate-clip-features");
        expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it("Replicate API error sur create → throw", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 401,
            text: async () => '{"detail":"Invalid token"}',
        }));

        await expect(embedImageViaReplicate("https://example.com/photo.jpg"))
            .rejects.toThrow(/Replicate create failed.*401/);
    });

    it("prediction failed → throw avec message", async () => {
        vi.stubGlobal("fetch", vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    id: "pred_fail",
                    status: "starting",
                    urls: { get: "https://api.replicate.com/v1/predictions/pred_fail" },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ status: "failed", error: "image not accessible" }),
            }));

        await expect(embedImageViaReplicate("https://broken.example/img.jpg"))
            .rejects.toThrow(/Replicate prediction failed: image not accessible/);
    });

    it("output format inattendu → throw", async () => {
        vi.stubGlobal("fetch", vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: "pred_x", status: "starting", urls: { get: "x" } }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ status: "succeeded", output: { unexpected: "shape" } }),
            }));

        await expect(embedImageViaReplicate("https://example.com/photo.jpg"))
            .rejects.toThrow(/output format unexpected/);
    });

    it("output direct number array (format alternatif Replicate) → accepté", async () => {
        const directArray = new Array(768).fill(0.5);
        vi.stubGlobal("fetch", vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: "pred_x", status: "starting", urls: { get: "x" } }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ status: "succeeded", output: directArray }),
            }));

        const result = await embedImageViaReplicate("https://example.com/photo.jpg");
        expect(result.embedding).toEqual(directArray);
    });
});
