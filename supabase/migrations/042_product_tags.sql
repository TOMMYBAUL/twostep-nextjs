-- ============================================================
-- Migration 042: Product tags + category columns + filter RPC
-- ============================================================

-- ============================================================
-- product_tags table
-- ============================================================
CREATE TABLE product_tags (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tag_type    TEXT        NOT NULL,  -- 'brand', 'color', 'gender', 'style', 'material', 'custom'
    tag_value   TEXT        NOT NULL,
    source      TEXT        NOT NULL DEFAULT 'ai',  -- 'ai', 'ean', 'merchant', 'rule'
    confidence  INTEGER     DEFAULT 100,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, tag_type, tag_value)
);

CREATE INDEX idx_product_tags_product    ON product_tags(product_id);
CREATE INDEX idx_product_tags_type_value ON product_tags(tag_type, tag_value);
CREATE INDEX idx_product_tags_type       ON product_tags(tag_type);

-- ============================================================
-- RLS: product_tags
-- ============================================================
ALTER TABLE product_tags ENABLE ROW LEVEL SECURITY;

-- Everyone can read tags
CREATE POLICY "product_tags_select_all" ON product_tags
    FOR SELECT USING (true);

-- Merchant can insert tags on their own products
CREATE POLICY "product_tags_insert_own" ON product_tags
    FOR INSERT WITH CHECK (
        product_id IN (
            SELECT p.id FROM products p
            JOIN merchants m ON m.id = p.merchant_id
            WHERE m.user_id = auth.uid()
        )
    );

-- Merchant can update tags on their own products
CREATE POLICY "product_tags_update_own" ON product_tags
    FOR UPDATE USING (
        product_id IN (
            SELECT p.id FROM products p
            JOIN merchants m ON m.id = p.merchant_id
            WHERE m.user_id = auth.uid()
        )
    );

-- Merchant can delete tags on their own products
CREATE POLICY "product_tags_delete_own" ON product_tags
    FOR DELETE USING (
        product_id IN (
            SELECT p.id FROM products p
            JOIN merchants m ON m.id = p.merchant_id
            WHERE m.user_id = auth.uid()
        )
    );

-- ============================================================
-- New columns on products
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id    UUID REFERENCES categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_categorized_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_confidence  INTEGER;

CREATE INDEX idx_products_category    ON products(category_id);
CREATE INDEX idx_products_subcategory ON products(subcategory_id);

-- ============================================================
-- New column on merchants
-- ============================================================
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS primary_category_id UUID REFERENCES categories(id);

-- ============================================================
-- RPC: get_filter_values
-- Returns available tag values for a given category within a radius.
-- Uses PostGIS ST_DWithin (geography) — consistent with the rest of the codebase.
-- ============================================================
CREATE OR REPLACE FUNCTION get_filter_values(
    p_category_slug TEXT,
    p_lat           DOUBLE PRECISION,
    p_lng           DOUBLE PRECISION,
    p_radius_km     DOUBLE PRECISION DEFAULT 10
)
RETURNS TABLE (
    tag_type  TEXT,
    tag_value TEXT,
    count     BIGINT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        pt.tag_type,
        pt.tag_value,
        COUNT(DISTINCT pt.product_id) AS count
    FROM product_tags pt
    JOIN products  p ON p.id = pt.product_id
    JOIN stock     s ON s.product_id = p.id AND s.quantity > 0
    JOIN merchants m ON m.id = p.merchant_id
    JOIN categories c ON c.id = p.category_id
    WHERE c.slug = p_category_slug
      AND p.visible IS NOT false
      AND p.variant_of IS NULL
      AND ST_DWithin(
          m.location,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_radius_km * 1000
      )
    GROUP BY pt.tag_type, pt.tag_value
    HAVING COUNT(DISTINCT pt.product_id) >= 1
    ORDER BY pt.tag_type, count DESC;
$$;
