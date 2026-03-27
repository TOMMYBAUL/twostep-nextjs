-- ══════════════════════════════════════
-- Migration 020: POS connections upgrade
-- Remplace merchant_pos_credentials par pos_connections
-- Ajoute colonnes POS aux products et promotions
-- Ajoute siret_verified et naf_code aux merchants
-- ══════════════════════════════════════

-- Nouvelle table pos_connections
CREATE TABLE IF NOT EXISTS pos_connections (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('square', 'shopify', 'lightspeed', 'sumup', 'zettle')),
    access_token text NOT NULL,
    refresh_token text,
    expires_at timestamptz,
    shop_domain text,
    extra jsonb DEFAULT '{}',
    last_sync_at timestamptz,
    last_sync_status text DEFAULT 'pending' CHECK (last_sync_status IN ('pending', 'success', 'error')),
    last_sync_error text,
    created_at timestamptz DEFAULT now(),
    UNIQUE(merchant_id, provider)
);

CREATE INDEX idx_pos_connections_merchant ON pos_connections(merchant_id);

ALTER TABLE pos_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants manage their own connections"
    ON pos_connections FOR ALL
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- Migrate data from old table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'merchant_pos_credentials') THEN
        INSERT INTO pos_connections (merchant_id, provider, access_token, refresh_token, expires_at, extra)
        SELECT
            mpc.merchant_id,
            COALESCE(m.pos_type, 'square') AS provider,
            mpc.access_token,
            mpc.refresh_token,
            mpc.expires_at,
            mpc.extra
        FROM merchant_pos_credentials mpc
        JOIN merchants m ON m.id = mpc.merchant_id
        WHERE m.pos_type IS NOT NULL
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- Add POS columns to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS pos_item_id text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pos_provider text;
CREATE INDEX IF NOT EXISTS idx_products_pos ON products(merchant_id, pos_item_id) WHERE pos_item_id IS NOT NULL;

-- Add merchant_id + POS columns to promotions
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS pos_promo_id text;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS pos_provider text;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS visible boolean DEFAULT true;

-- Backfill merchant_id from product → merchant relationship
UPDATE promotions SET merchant_id = p.merchant_id
FROM products p WHERE promotions.product_id = p.id AND promotions.merchant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_promotions_merchant ON promotions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_promotions_pos ON promotions(merchant_id, pos_promo_id) WHERE pos_promo_id IS NOT NULL;

-- Add SIRET verification to merchants
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS siret_verified boolean DEFAULT false;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS naf_code text;
