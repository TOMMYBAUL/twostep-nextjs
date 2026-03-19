import { vi } from "vitest";

// Mock Supabase client for unit tests
vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(() => ({
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
        })),
        auth: {
            getUser: vi.fn(),
        },
        rpc: vi.fn(),
    })),
}));
