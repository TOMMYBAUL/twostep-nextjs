-- Add precision columns for accurate product identification
-- canonical_name: authoritative product name from EAN database (what consumers see)
-- sku: supplier reference code for matching across invoices
-- category: product category from EAN enrichment

ALTER TABLE products ADD COLUMN IF NOT EXISTS canonical_name text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category text;

-- Index SKU for fast matching during invoice validation
CREATE INDEX IF NOT EXISTS idx_products_merchant_sku
  ON products(merchant_id, sku) WHERE sku IS NOT NULL;

-- Add category to ean_lookups cache
ALTER TABLE ean_lookups ADD COLUMN IF NOT EXISTS category text;

-- Allow "pending_review" status for invoice items (fuzzy matches awaiting human review)
-- Update the check constraint if one exists
DO $$
BEGIN
  ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_status_check;
  ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_status_check
    CHECK (status IN ('detected', 'validated', 'rejected', 'pending_review'));
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- Add "exact_sku" to match_type constraint
DO $$
BEGIN
  ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_match_type_check;
  ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_match_type_check
    CHECK (match_type IN ('exact_ean', 'exact_sku', 'exact_name', 'fuzzy'));
EXCEPTION WHEN others THEN
  NULL;
END $$;
