import crypto from "crypto";

/**
 * Signe et vérifie les paramètres `state` OAuth (anti-CSRF + anti-rejeu).
 * HMAC-SHA256 + horodatage signé : un state capturé expire après MAX_AGE_MS,
 * ce qui empêche le rejeu indéfini d'un ancien state.
 */

const MAX_AGE_MS = 10 * 60 * 1000; // un state OAuth n'est valable que 10 minutes

function getSecret(): string {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.EMAIL_ENCRYPTION_KEY;
    if (!secret) throw new Error("No secret available for state token signing");
    return secret;
}

function sign(value: string): string {
    return crypto.createHmac("sha256", getSecret()).update(value).digest("base64url");
}

/** Signe un payload horodaté : retourne "payload|timestamp.signature". */
export function signState(payload: string): string {
    const stamped = `${payload}|${Date.now()}`;
    return `${stamped}.${sign(stamped)}`;
}

/**
 * Vérifie la signature ET la fraîcheur, puis extrait le payload d'origine.
 * Retourne null si signature invalide, format cassé, ou state expiré (>10 min).
 */
export function verifyState(signed: string): string | null {
    const dotIndex = signed.lastIndexOf(".");
    if (dotIndex === -1) return null;

    const stamped = signed.substring(0, dotIndex);
    const sig = signed.substring(dotIndex + 1);

    const expected = sign(stamped);
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

    // stamped = "payload|timestamp" — on récupère le ts sur le DERNIER séparateur.
    const sepIndex = stamped.lastIndexOf("|");
    if (sepIndex === -1) return null;
    const payload = stamped.substring(0, sepIndex);
    const ts = Number(stamped.substring(sepIndex + 1));
    if (!Number.isFinite(ts)) return null;
    if (Date.now() - ts > MAX_AGE_MS) return null; // state expiré → rejet

    return payload;
}
