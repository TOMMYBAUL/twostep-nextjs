import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { signState, verifyState } from "@/lib/auth/state-token";

beforeAll(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret-key-for-state-hmac";
});
afterEach(() => vi.useRealTimers());

describe("state-token OAuth (CSRF + anti-rejeu)", () => {
    it("round-trip : signe puis vérifie, payload restitué sans le timestamp", () => {
        const signed = signState("shopify:7f3a-merchant");
        expect(verifyState(signed)).toBe("shopify:7f3a-merchant");
    });

    it("signature falsifiée → null", () => {
        const signed = signState("square:abc");
        expect(verifyState(signed.slice(0, -4) + "ZZZZ")).toBeNull();
    });

    it("payload altéré (même longueur) → null", () => {
        const signed = signState("shopify:aaa");
        const tampered = signed.replace("shopify:aaa", "shopify:bbb");
        expect(verifyState(tampered)).toBeNull();
    });

    it("format cassé (pas de signature) → null", () => {
        expect(verifyState("nimportequoi")).toBeNull();
        expect(verifyState("")).toBeNull();
    });

    it("state expiré (>10 min) → null (empêche le rejeu d'un vieux state)", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-17T12:00:00Z"));
        const signed = signState("lightspeed:m1");
        vi.setSystemTime(new Date("2026-06-17T12:11:00Z")); // +11 min
        expect(verifyState(signed)).toBeNull();
    });

    it("state frais (<10 min) → accepté", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-17T12:00:00Z"));
        const signed = signState("zettle:m1");
        vi.setSystemTime(new Date("2026-06-17T12:05:00Z")); // +5 min
        expect(verifyState(signed)).toBe("zettle:m1");
    });
});
