import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Jetons d'ingestion stock (workflow NearSt). Le jeton authentifie un push de
 * fichier sans session — la caisse du marchand le présente en `Bearer`.
 * Secret : 24 octets aléatoires (192 bits), stocké dans `ingest_credentials`
 * (RLS owner-only), jamais sur `merchants` (SELECT public).
 */

function generateToken(): string {
    return crypto.randomBytes(24).toString("hex");
}

/**
 * Retourne le jeton d'un marchand, le créant à la volée si absent.
 * @param admin client service_role (création/lecture).
 */
export async function getOrCreateIngestToken(
    merchantId: string,
    admin: SupabaseClient,
): Promise<string> {
    const { data: existing } = await admin
        .from("ingest_credentials")
        .select("token")
        .eq("merchant_id", merchantId)
        .maybeSingle();

    if (existing?.token) return existing.token;

    const token = generateToken();
    const { error } = await admin
        .from("ingest_credentials")
        .insert({ merchant_id: merchantId, token });
    if (error) throw new Error(`ingest token creation failed: ${error.message}`);
    return token;
}

/** Régénère le jeton (rotation) et retourne le nouveau. */
export async function rotateIngestToken(
    merchantId: string,
    admin: SupabaseClient,
): Promise<string> {
    const token = generateToken();
    const { error } = await admin
        .from("ingest_credentials")
        .upsert({ merchant_id: merchantId, token }, { onConflict: "merchant_id" });
    if (error) throw new Error(`ingest token rotation failed: ${error.message}`);
    return token;
}

/**
 * Résout un jeton -> merchant_id. Retourne null si inconnu.
 * Le jeton (192 bits aléatoires) est non-énumérable ; une simple égalité DB suffit.
 */
export async function resolveIngestToken(
    token: string,
    admin: SupabaseClient,
): Promise<string | null> {
    if (!token || token.length < 32) return null;
    const { data } = await admin
        .from("ingest_credentials")
        .select("merchant_id")
        .eq("token", token)
        .maybeSingle();
    return data?.merchant_id ?? null;
}
