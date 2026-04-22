-- 081_products_review_status.sql
-- Validation queue: products produced by enrichment cascade (POS bootstrap, scan,
-- CSV ingestors) start as `pending_review` and only become visible to consumers
-- once the merchant validates them via /dashboard/stock/review.
-- Plan: docs/superpowers/plans/2026-04-21-enrichissement-unifie.md (Task 9)

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'validated'
        CHECK (review_status IN ('pending_review', 'validated', 'rejected')),
    ADD COLUMN IF NOT EXISTS enrichment_source text,
    ADD COLUMN IF NOT EXISTS enrichment_proposed_at timestamptz,
    ADD COLUMN IF NOT EXISTS original_name text,
    ADD COLUMN IF NOT EXISTS original_image_url text;

-- Partial index — only the small set of products awaiting validation is indexed.
CREATE INDEX IF NOT EXISTS idx_products_review_status
    ON products(merchant_id, review_status)
    WHERE review_status = 'pending_review';

-- Backfill: existing products are considered already validated.
UPDATE products SET review_status = 'validated' WHERE review_status IS NULL;
