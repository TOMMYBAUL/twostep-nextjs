-- Migration 087 : product channel split (online / in_store / multi)
-- Suit deadline Google "Product ID split" mars 2026 (multi-canal mode/sport/électronique).
-- Cf. docs/superpowers/plans/2026-04-25-plan-action-production-v2.md Phase 1 Task 1.1
-- Cf. brain Two-Step Audit-angles-morts-2026-04-24.md (P1.1bis)

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_channel') THEN
        CREATE TYPE product_channel AS ENUM ('online', 'in_store', 'multi');
    END IF;
END $$;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS channel product_channel NOT NULL DEFAULT 'in_store';

ALTER TABLE merchants
    ADD COLUMN IF NOT EXISTS has_online_store BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_channel ON products(channel);

COMMENT ON COLUMN products.channel IS 'Google force product ID split mars 2026 : online vs in_store distinct IDs';
COMMENT ON COLUMN merchants.has_online_store IS 'true si le marchand a aussi une vitrine e-commerce (déclenche split product IDs)';
