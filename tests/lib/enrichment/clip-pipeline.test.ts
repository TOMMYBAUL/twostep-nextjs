import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock les sous-modules pour isoler clip-pipeline (tests unitaires)
vi.mock("@/lib/enrichment/clip-replicate", () => ({
    embedImageViaReplicate: vi.fn(),
}));
vi.mock("@/lib/enrichment/vectorize-client", () => ({
    upsertVectors: vi.fn(),
    queryVector: vi.fn(),
    deleteVectorById: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: vi.fn(),
}));

import { findSimilarByVector } from "@/lib/enrichment/clip-pipeline";
import { queryVector } from "@/lib/enrichment/vectorize-client";

const mockQueryVector = vi.mocked(queryVector);

beforeEach(() => {
    mockQueryVector.mockReset();
});

describe("findSimilarByVector", () => {
    it("seuil 0.95 — match retourne matched=true", async () => {
        mockQueryVector.mockResolvedValueOnce({
            matches: [
                { id: "p2", score: 0.97, metadata: { brand: "Nike" } },
                { id: "p3", score: 0.85, metadata: { brand: "Nike" } },
            ],
        });

        const result = await findSimilarByVector([0.1, 0.2], { brand: "Nike" });
        expect(result.matched).toBe(true);
        expect(result.score).toBe(0.97);
        expect(result.candidate?.id).toBe("p2");
    });

    it("score < 0.95 → matched=false", async () => {
        mockQueryVector.mockResolvedValueOnce({
            matches: [{ id: "p2", score: 0.93 }],
        });
        const result = await findSimilarByVector([0.1]);
        expect(result.matched).toBe(false);
        expect(result.score).toBe(0.93);
    });

    it("aucun candidat → matched=false, score 0", async () => {
        mockQueryVector.mockResolvedValueOnce({ matches: [] });
        const result = await findSimilarByVector([0.1]);
        expect(result.matched).toBe(false);
        expect(result.score).toBe(0);
    });

    it("excludeId filtre out le product lui-même", async () => {
        mockQueryVector.mockResolvedValueOnce({
            matches: [
                { id: "self", score: 1.0 }, // soi-même = match parfait, à exclure
                { id: "p2", score: 0.96 },
            ],
        });
        const result = await findSimilarByVector([0.1], { excludeId: "self" });
        expect(result.candidate?.id).toBe("p2");
        expect(result.score).toBe(0.96);
    });

    it("filter brand+category transmis à queryVector", async () => {
        mockQueryVector.mockResolvedValueOnce({ matches: [] });
        await findSimilarByVector([0.1], { brand: "Nike", category: "sneakers" });

        expect(mockQueryVector).toHaveBeenCalledWith(
            [0.1],
            expect.objectContaining({
                filter: { brand: "Nike", category: "sneakers" },
                topK: 5,
            }),
        );
    });

    it("aucun filter si brand/category null/undefined", async () => {
        mockQueryVector.mockResolvedValueOnce({ matches: [] });
        await findSimilarByVector([0.1], { brand: null, category: null });

        const call = mockQueryVector.mock.calls[0][1];
        expect(call?.filter).toBeUndefined();
    });
});

describe("CLIP_MATCH_THRESHOLD invariant", () => {
    it("le threshold doit être 0.95 pour aligner avec gate score-cascade", async () => {
        const { CLIP_MATCH_THRESHOLD } = await import("@/lib/enrichment/clip-pipeline");
        expect(CLIP_MATCH_THRESHOLD).toBe(0.95);
    });
});
