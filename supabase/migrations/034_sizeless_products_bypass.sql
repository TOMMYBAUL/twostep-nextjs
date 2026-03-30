-- Sizeless products (available_sizes IS NULL or empty) should pass through
-- size filters — they are "one size fits all" and relevant to every user.

-- ─── Feed RPC ───
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
        AND (filter_size IS NULL
            OR p.available_sizes IS NULL
            OR jsonb_array_length(p.available_sizes) = 0
            OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(p.available_sizes) elem
                WHERE elem->>'size' = filter_size AND (elem->>'quantity')::int > 0
            ))
    ORDER BY feed_score DESC
    LIMIT result_limit;
$$;

-- ─── Promos RPC ───
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
        AND (filter_size IS NULL
            OR p.available_sizes IS NULL
            OR jsonb_array_length(p.available_sizes) = 0
            OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(p.available_sizes) elem
                WHERE elem->>'size' = filter_size AND (elem->>'quantity')::int > 0
            ))
    ORDER BY distance_km ASC, pr.ends_at ASC NULLS LAST
    OFFSET result_offset
    LIMIT result_limit;
$$;

-- ─── Products nearby RPC ───
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
        p.name AS product_name,
        p.price AS product_price,
        p.photo_url AS product_photo,
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
        AND (filter_category IS NULL OR p.category = filter_category)
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

-- ─── Count RPC ───
CREATE OR REPLACE FUNCTION get_products_nearby_count(
    user_lat double precision,
    user_lng double precision,
    radius_km integer DEFAULT 10,
    filter_category text DEFAULT NULL,
    filter_size text DEFAULT NULL
)
RETURNS integer LANGUAGE sql STABLE AS $$
    SELECT count(*)::integer
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
        AND (filter_category IS NULL OR p.category = filter_category)
        AND (filter_size IS NULL
            OR p.available_sizes IS NULL
            OR jsonb_array_length(p.available_sizes) = 0
            OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(p.available_sizes) elem
                WHERE elem->>'size' = filter_size AND (elem->>'quantity')::int > 0
            ));
$$;

-- ─── Merchants nearby RPC ───
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
