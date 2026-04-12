-- Add file_hash column for deduplication of uploaded invoices/catalogs
-- SHA256 hash of file content, unique per merchant
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS file_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_merchant_file_hash
    ON invoices (merchant_id, file_hash)
    WHERE file_hash IS NOT NULL;

COMMENT ON COLUMN invoices.file_hash IS 'SHA256 hash of uploaded file content — prevents duplicate imports';
