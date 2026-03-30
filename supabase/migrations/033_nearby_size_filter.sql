-- Add size filter to get_merchants_nearby RPC
-- Only show merchants that have at least one product with the given size in stock
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
              AND p3.available_sizes IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements(p3.available_sizes) elem
                  WHERE elem->>'size' = filter_size
                    AND (elem->>'quantity')::int > 0
              )
        ))
    GROUP BY m.id, m.name, m.description, m.photo_url, m.logo_url, m.address, m.city, m.location
    HAVING COUNT(DISTINCT p.id) FILTER (WHERE s.quantity > 0) > 0
    ORDER BY distance_km ASC
    LIMIT result_limit;
$$;
