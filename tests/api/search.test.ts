import { describe, it, expect } from "vitest";

describe("Search API", () => {
    it("exports GET handler", async () => {
        const mod = await import("@/app/api/search/route");
        expect(mod.GET).toBeDefined();
    });

    it("GET /api/search returns 400 without lat/lng", async () => {
        const { GET } = await import("@/app/api/search/route");
        const req = new Request("http://localhost/api/search?q=sneakers");
        const res = await GET(req);
        expect(res.status).toBe(400);
    });
});
