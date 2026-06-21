// Chiffrement AES-256-GCM des secrets (tokens POS, credentials).
// Format versionné v1:iv:tag:ciphertext. Le flag STRICT_DECRYPT (à activer en
// prod APRÈS migration des tokens legacy) fait throw au lieu d'accepter un token
// non chiffré — cf. LESSONS "Sécurité" pour le rollout en 5 phases.

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const VERSION_PREFIX = "v1:";

function getKey(): Buffer {
    const key = process.env.EMAIL_ENCRYPTION_KEY;
    if (!key) throw new Error("EMAIL_ENCRYPTION_KEY not set");
    return Buffer.from(key, "hex");
}

/**
 * Encrypt plaintext to versioned ciphertext.
 * Format: v1:iv:tag:ciphertext (4 parts, all base64 except prefix)
 */
export function encrypt(plaintext: string): string {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8");
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${VERSION_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypt versioned ciphertext.
 * - If ciphertext starts with "v1:" → decrypt normally
 * - If ciphertext is legacy (no "v1:" prefix):
 *   - STRICT_DECRYPT=true → throw (production mode after migration)
 *   - else → log warning + return as-is (transition mode during migration)
 */
export function decrypt(ciphertext: string): string {
    if (!ciphertext.startsWith(VERSION_PREFIX)) {
        if (process.env.STRICT_DECRYPT === "true") {
            throw new Error(
                "[encryption] decrypt: legacy unencrypted/unversioned token blocked. " +
                "Run scripts/migrate-encrypt-tokens.mjs to migrate DB tokens to v1 format."
            );
        }
        // Transition mode: log + return as-is so app keeps working during migration window
        console.error(
            "[encryption] WARNING: decrypting legacy unversioned token. " +
            "Run migration before setting STRICT_DECRYPT=true."
        );
        return ciphertext;
    }

    const key = getKey();
    const stripped = ciphertext.slice(VERSION_PREFIX.length);
    const parts = stripped.split(":");
    if (parts.length !== 3) {
        throw new Error("[encryption] decrypt: malformed v1 ciphertext (expected 3 parts)");
    }
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const encrypted = Buffer.from(dataB64, "base64");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString("utf8");
}

/**
 * Helper to check if a value looks like a v1 ciphertext.
 * Useful for migration scripts and debugging.
 */
export function isVersionedCiphertext(value: string | null | undefined): boolean {
    return typeof value === "string" && value.startsWith(VERSION_PREFIX);
}
