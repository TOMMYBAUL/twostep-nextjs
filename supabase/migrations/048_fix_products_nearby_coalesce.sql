-- Fix 1: get_products_nearby — COALESCE for photo_processed_url/canonical_name + promo starts_at filter
-- Fix 2: get_merchants_nearby — restore missing visible/variant_of filters on LEFT JOIN products

-- ─── get_products_nearby ───
CREATE OR REPLACE FUNCTION get_products_nearby(
    user_lat double precision,
    user_lng double precision,
    radius_km integer DEFAULT 10,
    filter_category text DEFAULT NULL,
    result_offset integer DEFAULT 0,
    result_limit integer DEFAULT 20,
    filter_size text DEFAULT NULL
)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    product_price decimal,
    product_photo text,
    product_category text,
    stock_quantity integer,
    merchant_id uuid,
    merchant_name text,
    merchant_photo text,
    distance_km double precision,
    sale_price decimal
) LANGUAGE sql STABLE AS $$
    SELECT
        p.id AS product_id,
        COALESCE(p.canonical_name, p.name) AS product_name,
        p.price AS product_price,
        COALESCE(p.photo_processed_url, p.photo_url) AS product_photo,
        p.category AS product_category,
        s.quantity AS stock_quantity,
        m.id AS merchant_id,
        m.name AS merchant_name,
        m.photo_url AS merchant_photo,
        round((ST_Distance(
            m.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
        ) / 1000)::numeric, 1)::double precision AS distance_km,
        (
            SELECT pr.sale_price
            FROM promotions pr
            WHERE pr.product_id = p.id
              AND pr.starts_at <= now()
              AND (pr.ends_at IS NULL OR pr.ends_at > now())
            ORDER BY pr.sale_price ASC
            LIMIT 1
        ) AS sale_price
    FROM products p
    JOIN stock s ON s.product_id = p.id
    JOIN merchants m ON m.id = p.merchant_id
    WHERE m.location IS NOT NULL
        AND p.visible = true
        AND p.variant_of IS NULL
        AND ST_DWithin(
            m.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            radius_km * 1000
        )
        AND (filter_category IS NULL OR LOWER(p.category) = LOWER(filter_category))
        AND (filter_size IS NULL
            OR p.available_sizes IS NULL
            OR jsonb_array_length(p.available_sizes) = 0
            OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(p.available_sizes) elem
                WHERE elem->>'size' = filter_size AND (elem->>'quantity')::int > 0
            ))
    ORDER BY
        CASE WHEN s.quantity > 0 THEN 0 ELSE 1 END,
        distance_km ASC
    OFFSET result_offset
    LIMIT result_limit;
$$;

-- ─── get_merchants_nearby (restore visible + variant_of filters) ───
CREATE OR REPLACE FUNCTION get_merchants_nearby(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    radius_km INT DEFAULT 10,
    category_filter TEXT DEFAULT NULL,
    result_limit INT DEFAULT 50,
    filter_size TEXT DEFAULT NULL
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
    LEFT JOIN products p ON p.merchant_id = m.id AND p.visible = true AND p.variant_of IS NULL
    LEFT JOIN stock s ON s.product_id = p.id
    LEFT JOIN promotions pr ON pr.product_id = p.id
    WHERE m.status = 'active'
        AND ST_DWithin(
            m.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            radius_km * 1000
        )
        AND (category_filter IS NULL OR EXISTS (
            SELECT 1 FROM products p2 WHERE p2.merchant_id = m.id AND LOWER(p2.category) = LOWER(category_filter)
        ))
        AND (filter_size IS NULL OR EXISTS (
            SELECT 1 FROM products p3
            WHERE p3.merchant_id = m.id
              AND (
                  p3.available_sizes IS NULL
                  OR jsonb_array_length(COALESCE(p3.available_sizes, '[]'::jsonb)) = 0
                  OR EXISTS (
                      SELECT 1 FROM jsonb_array_elements(p3.available_sizes) elem
                      WHERE elem->>'size' = filter_size
                        AND (elem->>'quantity')::int > 0
                  )
              )
        ))
    GROUP BY m.id, m.name, m.description, m.photo_url, m.logo_url, m.address, m.city, m.location
    HAVING COUNT(DISTINCT p.id) FILTER (WHERE s.quantity > 0) > 0
    ORDER BY distance_km ASC
    LIMIT result_limit;
$$;
