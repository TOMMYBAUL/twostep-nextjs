import { describe, it, expect } from "vitest";

describe("Products API", () => {
    it("exports GET and POST handlers", async () => {
        const mod = await import("@/app/api/products/route");
        expect(mod.GET).toBeDefined();
        expect(mod.POST).toBeDefined();
    });

    it("GET /api/products returns 400 if merchant_id missing", async () => {
        const { GET } = await import("@/app/api/products/route");
        const req = new Request("http://localhost/api/products");
        const res = await GET(req);
        expect(res.status).toBe(400);
    });

    it("POST /api/products returns 401 if not authenticated", async () => {
        const { POST } = await import("@/app/api/products/route");
        const req = new Request("http://localhost/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ merchant_id: "abc", name: "Test" }),
        });
        const res = await POST(req);
        expect(res.status).toBe(401);
    });
});
