-- ══════════════════════════════════════
-- Migration 021: Image pipeline
-- Table image_jobs pour le traitement async des photos
-- Colonnes photo_processed_url et photo_source sur products
-- ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS image_jobs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    source_url text NOT NULL,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    result_url text,
    error text,
    attempts int DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    processed_at timestamptz
);

CREATE INDEX idx_image_jobs_pending ON image_jobs(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_image_jobs_merchant ON image_jobs(merchant_id);
CREATE INDEX idx_image_jobs_product ON image_jobs(product_id);

ALTER TABLE image_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants see their own image jobs"
    ON image_jobs FOR SELECT
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_processed_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_source text CHECK (photo_source IN ('pos', 'ean', 'manual'));
