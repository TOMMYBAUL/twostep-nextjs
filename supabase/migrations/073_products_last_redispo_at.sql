-- Migration 073 — Track recent re-approvisionnement (Plan 06 Task 8/9)
-- Every product touched by a validated invoice gets last_redispo_at = now().
-- Used by the "Revenue en stock" 24h badge on VariantPanel.

ALTER TABLE products ADD COLUMN IF NOT EXISTS last_redispo_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_products_recent_redispo
    ON products (last_redispo_at DESC)
    WHERE last_redispo_at IS NOT NULL;
