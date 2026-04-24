// DRAFT — to copy into tests/lib/email/encryption.test.ts after review

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";

// Generate a test key (32 bytes hex for AES-256)
const TEST_KEY = crypto.randomBytes(32).toString("hex");

describe("email/encryption", () => {
    let originalKey: string | undefined;
    let originalStrict: string | undefined;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        originalKey = process.env.EMAIL_ENCRYPTION_KEY;
        originalStrict = process.env.STRICT_DECRYPT;
        process.env.EMAIL_ENCRYPTION_KEY = TEST_KEY;
        delete process.env.STRICT_DECRYPT;
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        // Force module re-import to pick up env changes if needed
        vi.resetModules();
    });

    afterEach(() => {
        if (originalKey === undefined) delete process.env.EMAIL_ENCRYPTION_KEY;
        else process.env.EMAIL_ENCRYPTION_KEY = originalKey;
        if (originalStrict === undefined) delete process.env.STRICT_DECRYPT;
        else process.env.STRICT_DECRYPT = originalStrict;
        consoleErrorSpy.mockRestore();
    });

    it("encrypt returns versioned ciphertext starting with v1:", async () => {
        const { encrypt } = await import("@/lib/email/encryption");
        const ct = encrypt("hello world");
        expect(ct).toMatch(/^v1:/);
        expect(ct.split(":").length).toBe(4); // v1 + iv + tag + data
    });

    it("encrypt + decrypt roundtrip is identity", async () => {
        const { encrypt, decrypt } = await import("@/lib/email/encryption");
        const plaintext = "shopify_access_token_xyz_12345";
        const ct = encrypt(plaintext);
        expect(decrypt(ct)).toBe(plaintext);
    });

    it("decrypt(legacy non-v1) returns as-is + logs warning when STRICT_DECRYPT not set", async () => {
        const { decrypt } = await import("@/lib/email/encryption");
        const legacy = "legacy_unencrypted_token_no_version";
        expect(decrypt(legacy)).toBe(legacy);
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("legacy unversioned token"));
    });

    it("decrypt(legacy non-v1) throws when STRICT_DECRYPT=true", async () => {
        process.env.STRICT_DECRYPT = "true";
        vi.resetModules();
        const { decrypt } = await import("@/lib/email/encryption");
        expect(() => decrypt("legacy_token")).toThrow(/legacy unencrypted/);
    });

    it("decrypt(corrupted v1 ciphertext) throws", async () => {
        const { decrypt } = await import("@/lib/email/encryption");
        expect(() => decrypt("v1:invalid:base64:data")).toThrow();
    });

    it("decrypt(malformed v1 with wrong part count) throws", async () => {
        const { decrypt } = await import("@/lib/email/encryption");
        expect(() => decrypt("v1:only_two_parts")).toThrow(/malformed v1/);
    });

    it("getKey throws when EMAIL_ENCRYPTION_KEY not set", async () => {
        delete process.env.EMAIL_ENCRYPTION_KEY;
        vi.resetModules();
        const { encrypt } = await import("@/lib/email/encryption");
        expect(() => encrypt("test")).toThrow(/EMAIL_ENCRYPTION_KEY not set/);
    });

    it("encrypt produces different ciphertext for same plaintext (random IV)", async () => {
        const { encrypt } = await import("@/lib/email/encryption");
        const plaintext = "same_input";
        const ct1 = encrypt(plaintext);
        const ct2 = encrypt(plaintext);
        expect(ct1).not.toBe(ct2);
    });

    it("isVersionedCiphertext correctly identifies v1 vs legacy", async () => {
        const { isVersionedCiphertext, encrypt } = await import("@/lib/email/encryption");
        expect(isVersionedCiphertext("v1:foo:bar:baz")).toBe(true);
        expect(isVersionedCiphertext(encrypt("test"))).toBe(true);
        expect(isVersionedCiphertext("legacy_no_prefix")).toBe(false);
        expect(isVersionedCiphertext(null)).toBe(false);
        expect(isVersionedCiphertext(undefined)).toBe(false);
        expect(isVersionedCiphertext("")).toBe(false);
    });
});
