import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAdmin } from "@/lib/admin/guard";

describe("isAdmin", () => {
    const originalEnv = process.env.ADMIN_EMAILS;
    beforeEach(() => {
        process.env.ADMIN_EMAILS = "alice@x.com,bob@y.com";
    });
    afterEach(() => {
        process.env.ADMIN_EMAILS = originalEnv;
    });

    it("returns true for whitelisted email", () => {
        expect(isAdmin("alice@x.com")).toBe(true);
    });
    it("returns false for non-whitelisted email", () => {
        expect(isAdmin("eve@evil.com")).toBe(false);
    });
    it("returns false for null email", () => {
        expect(isAdmin(null)).toBe(false);
    });
    it("returns false for undefined email", () => {
        expect(isAdmin(undefined)).toBe(false);
    });
    it("returns false when ADMIN_EMAILS env empty", () => {
        process.env.ADMIN_EMAILS = "";
        expect(isAdmin("alice@x.com")).toBe(false);
    });
    it("trims whitespace in env list", () => {
        process.env.ADMIN_EMAILS = "alice@x.com , bob@y.com";
        expect(isAdmin("bob@y.com")).toBe(true);
    });
});
