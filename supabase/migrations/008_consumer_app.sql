-- ══════════════════════════════════════
-- Migration 008: Consumer App tables
-- Two-Step Phase 1 MVP
-- ══════════════════════════════════════

-- ─── Extend merchants (shop profile fields) ───
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS links JSONB DEFAULT '{}';

-- ─── Extend consumer_profiles (notification prefs) ───
ALTER TABLE consumer_profiles ADD COLUMN IF NOT EXISTS notify_stock_low BOOLEAN DEFAULT true;
ALTER TABLE consumer_profiles ADD COLUMN IF NOT EXISTS notify_out_of_stock BOOLEAN DEFAULT true;
ALTER TABLE consumer_profiles ADD COLUMN IF NOT EXISTS notify_back_in_stock BOOLEAN DEFAULT true;
ALTER TABLE consumer_profiles ADD COLUMN IF NOT EXISTS notify_new_products BOOLEAN DEFAULT true;
ALTER TABLE consumer_profiles ADD COLUMN IF NOT EXISTS notify_new_promos BOOLEAN DEFAULT true;
ALTER TABLE consumer_profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- ─── user_favorites ───
CREATE TABLE user_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, product_id)
);
CREATE INDEX idx_favorites_user ON user_favorites(user_id);

-- ─── user_follows ───
CREATE TABLE user_follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, merchant_id)
);
CREATE INDEX idx_follows_user ON user_follows(user_id);
CREATE INDEX idx_follows_merchant ON user_follows(merchant_id);

-- ─── stock_alerts ───
CREATE TABLE stock_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('stock_low', 'out_of_stock', 'back_in_stock')),
    sent_at TIMESTAMPTZ DEFAULT now(),
    read_at TIMESTAMPTZ
);
CREATE INDEX idx_alerts_user ON stock_alerts(user_id, read_at);

-- ─── RLS: user_favorites ───
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "favorites_select_own" ON user_favorites FOR SELECT
    USING (auth.uid() = user_id);
CREATE POLICY "favorites_insert_own" ON user_favorites FOR INSERT
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY "favorites_delete_own" ON user_favorites FOR DELETE
    USING (auth.uid() = user_id);

-- ─── RLS: user_follows ───
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows_select_own" ON user_follows FOR SELECT
    USING (auth.uid() = user_id);
CREATE POLICY "follows_insert_own" ON user_follows FOR INSERT
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY "follows_delete_own" ON user_follows FOR DELETE
    USING (auth.uid() = user_id);

-- ─── RLS: stock_alerts ───
ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alerts_select_own" ON stock_alerts FOR SELECT
    USING (auth.uid() = user_id);
CREATE POLICY "alerts_update_own" ON stock_alerts FOR UPDATE
    USING (auth.uid() = user_id);

-- ─── RPC: get_merchants_nearby ───
CREATE OR REPLACE FUNCTION get_merchants_nearby(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    radius_km INT DEFAULT 10,
    category_filter TEXT DEFAULT NULL,
    result_limit INT DEFAULT 50
) RETURNS TABLE (
    merchant_id UUID,
    merchant_name TEXT,
    merchant_description TEXT,
    merchant_photo TEXT,
    merchant_logo TEXT,
    merchant_address TEXT,
    merchant_city TEXT,
    merchant_lat DOUBLE PRECISION,
    merchant_lng DOUBLE PRECISION,
    distance_km DOUBLE PRECISION,
    product_count BIGINT,
    promo_count BIGINT
) LANGUAGE sql STABLE AS $$
    SELECT
        m.id AS merchant_id,
        m.name AS merchant_name,
        m.description AS merchant_description,
        m.photo_url AS merchant_photo,
        m.logo_url AS merchant_logo,
        m.address AS merchant_address,
        m.city AS merchant_city,
        ST_Y(m.location::geometry) AS merchant_lat,
        ST_X(m.location::geometry) AS merchant_lng,
        round((ST_Distance(
            m.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
        ) / 1000)::numeric, 1)::double precision AS distance_km,
        COUNT(DISTINCT p.id) FILTER (WHERE s.quantity > 0) AS product_count,
        COUNT(DISTINCT pr.id) FILTER (
            WHERE pr.starts_at <= now()
            AND (pr.ends_at IS NULL OR pr.ends_at > now())
        ) AS promo_count
    FROM merchants m
    LEFT JOIN products p ON p.merchant_id = m.id
    LEFT JOIN stock s ON s.product_id = p.id
    LEFT JOIN promotions pr ON pr.product_id = p.id
    WHERE m.status = 'active'
        AND ST_DWithin(
            m.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            radius_km * 1000
        )
        AND (category_filter IS NULL OR EXISTS (
            SELECT 1 FROM products p2 WHERE p2.merchant_id = m.id AND p2.category = category_filter
        ))
    GROUP BY m.id, m.name, m.description, m.photo_url, m.logo_url, m.address, m.city, m.location
    HAVING COUNT(DISTINCT p.id) FILTER (WHERE s.quantity > 0) > 0
    ORDER BY distance_km ASC
    LIMIT result_limit;
$$;

-- ─── RPC: autocomplete_suggestions ───
CREATE OR REPLACE FUNCTION autocomplete_suggestions(
    query_text TEXT,
    result_limit INT DEFAULT 10
) RETURNS TABLE (
    suggestion TEXT,
    suggestion_type TEXT
) LANGUAGE sql STABLE AS $$
    (SELECT DISTINCT p.name AS suggestion, 'product'::TEXT AS suggestion_type
    FROM products p JOIN stock s ON s.product_id = p.id
    WHERE s.quantity > 0 AND p.name ILIKE '%' || query_text || '%'
    LIMIT result_limit)
    UNION ALL
    (SELECT DISTINCT p.brand AS suggestion, 'brand'::TEXT AS suggestion_type
    FROM products p JOIN stock s ON s.product_id = p.id
    WHERE s.quantity > 0 AND p.brand IS NOT NULL AND p.brand ILIKE '%' || query_text || '%'
    LIMIT 5)
    UNION ALL
    (SELECT DISTINCT p.category AS suggestion, 'category'::TEXT AS suggestion_type
    FROM products p JOIN stock s ON s.product_id = p.id
    WHERE s.quantity > 0 AND p.category IS NOT NULL AND p.category ILIKE '%' || query_text || '%'
    LIMIT 5);
$$;

-- ─── RPC: get_merchant_profile ───
CREATE OR REPLACE FUNCTION get_merchant_profile(
    target_merchant_id UUID,
    requesting_user_id UUID DEFAULT NULL
) RETURNS TABLE (
    merchant_id UUID,
    merchant_name TEXT,
    merchant_description TEXT,
    merchant_photo TEXT,
    merchant_logo TEXT,
    merchant_cover TEXT,
    merchant_address TEXT,
    merchant_city TEXT,
    merchant_links JSONB,
    merchant_opening_hours JSONB,
    product_count BIGINT,
    follower_count BIGINT,
    is_following BOOLEAN
) LANGUAGE sql STABLE AS $$
    SELECT
        m.id AS merchant_id,
        m.name AS merchant_name,
        m.description AS merchant_description,
        m.photo_url AS merchant_photo,
        m.logo_url AS merchant_logo,
        m.cover_photo_url AS merchant_cover,
        m.address AS merchant_address,
        m.city AS merchant_city,
        m.links AS merchant_links,
        m.opening_hours AS merchant_opening_hours,
        (SELECT COUNT(*) FROM products p JOIN stock s ON s.product_id = p.id WHERE p.merchant_id = m.id AND s.quantity > 0) AS product_count,
        (SELECT COUNT(*) FROM user_follows uf WHERE uf.merchant_id = m.id) AS follower_count,
        CASE WHEN requesting_user_id IS NULL THEN false
             ELSE EXISTS (SELECT 1 FROM user_follows uf WHERE uf.merchant_id = m.id AND uf.user_id = requesting_user_id)
        END AS is_following
    FROM merchants m
    WHERE m.id = target_merchant_id;
$$;
