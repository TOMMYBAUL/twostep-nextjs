import crypto from "crypto";

/**
 * Sign and verify OAuth state parameters to prevent CSRF.
 * Uses HMAC-SHA256 with the app's SUPABASE_SERVICE_ROLE_KEY as secret.
 */

function getSecret(): string {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.EMAIL_ENCRYPTION_KEY;
    if (!secret) throw new Error("No secret available for state token signing");
    return secret;
}

/** Sign a state payload: returns "payload.signature" */
export function signState(payload: string): string {
    const hmac = crypto.createHmac("sha256", getSecret());
    hmac.update(payload);
    const sig = hmac.digest("base64url");
    return `${payload}.${sig}`;
}

/** Verify and extract the payload from a signed state. Returns null if invalid. */
export function verifyState(signed: string): string | null {
    const dotIndex = signed.lastIndexOf(".");
    if (dotIndex === -1) return null;

    const payload = signed.substring(0, dotIndex);
    const sig = signed.substring(dotIndex + 1);

    const hmac = crypto.createHmac("sha256", getSecret());
    hmac.update(payload);
    const expected = hmac.digest("base64url");

    // Constant-time comparison
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

    return payload;
}
