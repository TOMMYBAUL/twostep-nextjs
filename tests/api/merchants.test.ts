import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
} as any);

describe("Merchants API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("exports GET and POST handlers", async () => {
        const mod = await import("@/app/api/merchants/route");
        expect(mod.GET).toBeDefined();
        expect(mod.POST).toBeDefined();
    });

    it("POST /api/merchants returns 401 if not authenticated", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });

        const { POST } = await import("@/app/api/merchants/route");
        const req = new NextRequest("http://localhost/api/merchants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: "1 rue test", city: "Toulouse" }),
        });
        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it("POST /api/merchants returns 400 if name missing", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

        const { POST } = await import("@/app/api/merchants/route");
        const req = new NextRequest("http://localhost/api/merchants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: "1 rue test", city: "Toulouse" }),
        });
        const res = await POST(req);
        expect(res.status).toBe(400);
    });
});
