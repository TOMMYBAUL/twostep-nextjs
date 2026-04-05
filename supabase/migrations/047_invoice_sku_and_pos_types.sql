-- ══════════════════════════════════════
-- Migration 047: Fix invoice_items.sku + pos_type constraint + invoice source
-- Aligns DB schema with current codebase
-- ══════════════════════════════════════

-- 1. invoice_items: add missing sku column
--    Code writes sku in cron/scan-emails, invoices/upload, and invoices/[id]/validate
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS sku text;

CREATE INDEX IF NOT EXISTS idx_invoice_items_sku
  ON invoice_items(sku) WHERE sku IS NOT NULL;

-- 2. invoices: source constraint — add 'manual' (used in POST /api/invoices)
DO $$
BEGIN
  ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_source_check;
  ALTER TABLE invoices ADD CONSTRAINT invoices_source_check
    CHECK (source IN ('email', 'upload', 'einvoice', 'manual'));
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- 3. merchants: pos_type — add zettle, clictill, fastmag
--    Migration 003 set ('square', 'lightspeed', 'shopify')
ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_pos_type_check;
ALTER TABLE merchants ADD CONSTRAINT merchants_pos_type_check
  CHECK (pos_type IN ('square', 'lightspeed', 'shopify', 'zettle', 'clictill', 'fastmag'));

-- 4. pos_connections: provider — add clictill, fastmag
--    Migration 020 set ('square', 'shopify', 'lightspeed', 'sumup', 'zettle')
DO $$
BEGIN
  ALTER TABLE pos_connections DROP CONSTRAINT IF EXISTS pos_connections_provider_check;
  ALTER TABLE pos_connections ADD CONSTRAINT pos_connections_provider_check
    CHECK (provider IN ('square', 'shopify', 'lightspeed', 'sumup', 'zettle', 'clictill', 'fastmag'));
EXCEPTION WHEN others THEN
  NULL;
END $$;
