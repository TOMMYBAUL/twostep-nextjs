-- ══════════════════════════════════════
-- Migration 004: Invoice email deduplication
-- Prevents the cron scan-emails job from
-- processing the same attachment twice.
-- ══════════════════════════════════════

-- email_hash: deterministic hash of the email messageId + attachment filename
-- unique per merchant so the same supplier email forwarded to two merchants
-- is still ingested for each.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS email_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_merchant_email_hash
    ON invoices (merchant_id, email_hash)
    WHERE email_hash IS NOT NULL;
