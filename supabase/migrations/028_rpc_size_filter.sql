-- Add size filtering directly in RPCs (scalable to millions of products)
-- Uses JSONB @> operator which is indexable

-- Index for fast JSONB size lookups
CREATE INDEX IF NOT EXISTS idx_products_available_sizes ON products USING gin (available_sizes);

-- ─── Feed RPC with optional size filter ───
CREATE OR REPLACE FUNCTION get_feed_nearby(
    user_lat double precision,
    user_lng double precision,
    radius_km integer DEFAULT 10,
    cursor_score double precision DEFAULT 999999,
    result_limit integer DEFAULT 20,
    filter_size text DEFAULT NULL
)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    product_price decimal,
    product_photo text,
    product_ean text,
    product_brand text,
    stock_quantity integer,
    merchant_id uuid,
    merchant_name text,
    merchant_address text,
    merchant_city text,
    distance_km double precision,
    event_type text,
    event_created_at timestamptz,
    feed_score double precision
) LANGUAGE sql STABLE AS $$
    SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.price AS product_price,
        p.photo_url AS product_photo,
        p.ean AS product_ean,
        p.brand AS product_brand,
        s.quantity AS stock_quantity,
        m.id AS merchant_id,
        m.name AS merchant_name,
        m.address AS merchant_address,
        m.city AS merchant_city,
        round((ST_Distance(
            m.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
        ) / 1000)::numeric, 1)::double precision AS distance_km,
        fe.event_type,
        fe.created_at AS event_created_at,
        (1.0 / GREATEST(
            round((ST_Distance(
                m.location,
                ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
            ) / 1000)::numeric, 1)::double precision,
            0.1
        )) * (1.0 / (EXTRACT(EPOCH FROM (now() - fe.created_at)) / 86400 + 1))
        AS feed_score
    FROM feed_events fe
    JOIN products p ON p.id = fe.product_id
    JOIN stock s ON s.product_id = p.id
    JOIN merchants m ON m.id = fe.merchant_id
    WHERE s.quantity > 0
        AND p.visible = true
        AND p.variant_of IS NULL
        AND ST_DWithin(
            m.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            radius_km * 1000
        )
        AND (1.0 / GREATEST(
            round((ST_Distance(
                m.location,
                ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
            ) / 1000)::numeric, 1)::double precision,
            0.1
        )) * (1.0 / (EXTRACT(EPOCH FROM (now() - fe.created_at)) / 86400 + 1)) < cursor_score
        AND (filter_size IS NULL OR p.available_sizes @> ('[{"size":"' || filter_size || '"}]')::jsonb)
    ORDER BY feed_score DESC
    LIMIT result_limit;
$$;

-- ─── Promos RPC with optional size filter ───
CREATE OR REPLACE FUNCTION get_promos_nearby(
    user_lat double precision,
    user_lng double precision,
    radius_km integer DEFAULT 10,
    result_offset integer DEFAULT 0,
    result_limit integer DEFAULT 20,
    filter_size text DEFAULT NULL
)
RETURNS TABLE (
    promo_id uuid,
    sale_price decimal,
    starts_at timestamptz,
    ends_at timestamptz,
    product_id uuid,
    product_name text,
    product_price decimal,
    product_photo text,
    product_ean text,
    product_brand text,
    stock_quantity integer,
    merchant_id uuid,
    merchant_name text,
    merchant_address text,
    merchant_city text,
    distance_km double precision
) LANGUAGE sql STABLE AS $$
    SELECT
        pr.id AS promo_id,
        pr.sale_price,
        pr.starts_at,
        pr.ends_at,
        p.id AS product_id,
        p.name AS product_name,
        p.price AS product_price,
        p.photo_url AS product_photo,
        p.ean AS product_ean,
        p.brand AS product_brand,
        s.quantity AS stock_quantity,
        m.id AS merchant_id,
        m.name AS merchant_name,
        m.address AS merchant_address,
        m.city AS merchant_city,
        round((ST_Distance(
            m.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
        ) / 1000)::numeric, 1)::double precision AS distance_km
    FROM promotions pr
    JOIN products p ON p.id = pr.product_id
    JOIN stock s ON s.product_id = p.id
    JOIN merchants m ON m.id = p.merchant_id
    WHERE s.quantity > 0
        AND p.visible = true
        AND p.variant_of IS NULL
        AND pr.starts_at <= now()
        AND (pr.ends_at IS NULL OR pr.ends_at > now())
        AND ST_DWithin(
            m.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            radius_km * 1000
        )
        AND (filter_size IS NULL OR p.available_sizes @> ('[{"size":"' || filter_size || '"}]')::jsonb)
    ORDER BY distance_km ASC, pr.ends_at ASC NULLS LAST
    OFFSET result_offset
    LIMIT result_limit;
$$;
