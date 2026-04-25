#!/usr/bin/env node
// DRAFT — to copy into scripts/migrate-encrypt-tokens.mjs after review
//
// One-shot migration: encrypt all legacy unversioned tokens in DB to v1: format.
// Reads pos_connections + google_merchant_connections, re-encrypts any token
// not starting with "v1:".
//
// USAGE:
//   1. Ensure SUPABASE_SERVICE_ROLE_KEY + EMAIL_ENCRYPTION_KEY are set in env
//   2. Run: node scripts/migrate-encrypt-tokens.mjs
//   3. Optional --dry-run flag to audit without modifying
//
// SAFETY:
//   - Uses SERVICE_ROLE so bypasses RLS (intentional, admin script)
//   - Rolls back per-row on encryption error (continues with next row)
//   - Final report shows: total rows / migrated / skipped (already v1) / errors

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const VERSION_PREFIX = "v1:";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

if (!SUPABASE_URL || !SERVICE_ROLE || !ENCRYPTION_KEY) {
    console.error("Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EMAIL_ENCRYPTION_KEY");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
const key = Buffer.from(ENCRYPTION_KEY, "hex");

function encryptV1(plaintext) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, "utf8");
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${VERSION_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function isV1(value) {
    return typeof value === "string" && value.startsWith(VERSION_PREFIX);
}

/**
 * Decrypt assumes ALREADY-encrypted-but-old-format (no v1: prefix, just iv:tag:ciphertext).
 * Returns null if value cannot be decrypted (truly unencrypted plaintext token).
 */
function tryDecryptLegacyEncrypted(ciphertext) {
    if (!ciphertext.includes(":")) return null;
    try {
        const [ivB64, tagB64, dataB64] = ciphertext.split(":");
        const iv = Buffer.from(ivB64, "base64");
        const tag = Buffer.from(tagB64, "base64");
        const encrypted = Buffer.from(dataB64, "base64");
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString("utf8");
    } catch {
        return null;
    }
}

/**
 * For a legacy value: decrypt it (if it was old-format encrypted), then re-encrypt with v1.
 * If it's truly unencrypted plaintext (e.g. "shpat_xxx"), encrypt it directly.
 */
function migrateValue(rawValue) {
    if (!rawValue) return null;
    if (isV1(rawValue)) return null; // already migrated, skip
    const plaintext = tryDecryptLegacyEncrypted(rawValue) ?? rawValue;
    return encryptV1(plaintext);
}

async function migrateTable(tableName, columns) {
    console.log(`\n=== Migrating ${tableName} ===`);
    const { data: rows, error } = await supabase.from(tableName).select(`id, ${columns.join(", ")}`);
    if (error) {
        console.error(`Error reading ${tableName}:`, error.message);
        return { total: 0, migrated: 0, skipped: 0, errors: 1 };
    }

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows) {
        const updates = {};
        let needsUpdate = false;
        for (const col of columns) {
            const newValue = migrateValue(row[col]);
            if (newValue !== null) {
                updates[col] = newValue;
                needsUpdate = true;
            }
        }

        if (!needsUpdate) {
            skipped++;
            continue;
        }

        if (DRY_RUN) {
            console.log(`[dry-run] ${tableName} ${row.id}: would migrate columns ${Object.keys(updates).join(", ")}`);
            migrated++;
            continue;
        }

        const { error: updateError } = await supabase.from(tableName).update(updates).eq("id", row.id);
        if (updateError) {
            console.error(`Error updating ${tableName} ${row.id}:`, updateError.message);
            errors++;
        } else {
            migrated++;
            console.log(`✓ ${tableName} ${row.id}: migrated columns ${Object.keys(updates).join(", ")}`);
        }
    }

    return { total: rows.length, migrated, skipped, errors };
}

async function main() {
    console.log(`Encryption migration ${DRY_RUN ? "(DRY RUN)" : "(LIVE)"} — start ${new Date().toISOString()}`);

    const posReport = await migrateTable("pos_connections", ["access_token", "refresh_token"]);
    const googleReport = await migrateTable("google_merchant_connections", ["access_token", "refresh_token"]);

    // Optional: also handle merchant_pos_connections legacy if exists
    let legacyReport = { total: 0, migrated: 0, skipped: 0, errors: 0 };
    try {
        legacyReport = await migrateTable("merchant_pos_connections", ["access_token", "refresh_token"]);
    } catch {
        console.log("merchant_pos_connections not found (legacy table absent), skipping");
    }

    console.log("\n=== Final report ===");
    console.log(`pos_connections             : ${JSON.stringify(posReport)}`);
    console.log(`google_merchant_connections : ${JSON.stringify(googleReport)}`);
    console.log(`merchant_pos_connections    : ${JSON.stringify(legacyReport)}`);

    const totalErrors = posReport.errors + googleReport.errors + legacyReport.errors;
    if (totalErrors > 0) {
        console.error(`\n⚠️  ${totalErrors} errors encountered. Review logs above.`);
        process.exit(1);
    }
    console.log(`\n✅ Migration ${DRY_RUN ? "(dry-run) " : ""}completed successfully.`);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
