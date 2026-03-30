-- Fix case-sensitive category matching
-- Seeds and POS adapters store categories with mixed case ("Chaussures", "Mode")
-- Frontend sends lowercase ("chaussures", "mode")
-- Solution: normalize all existing categories to lowercase + use LOWER() in RPCs

-- 1. Normalize existing data
UPDATE products SET category = LOWER(category) WHERE category IS NOT NULL AND category != LOWER(category);

-- 2. Update get_merchants_nearby to use case-insensitive comparison
CREATE OR REPLACE FUNCTION get_merchants_nearby(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    radius_km DOUBLE PRECISION DEFAULT 10,
    category_filter TEXT DEFAULT NULL,
    result_limit INTEGER DEFAULT 50,
    filter_size TEXT DEFAULT NULL
)
RETURNS TABLE (
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
)
LANGUAGE sql STABLE
AS $$
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
        ST_Distance(
            m.location::geography,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
        ) / 1000.0 AS distance_km,
        (SELECT COUNT(*) FROM products p
         WHERE p.merchant_id = m.id
           AND p.visible = true
           AND p.variant_of IS NULL
           AND EXISTS (SELECT 1 FROM stock s WHERE s.product_id = p.id AND s.quantity > 0)
           AND (filter_size IS NULL
                OR p.available_sizes IS NULL
                OR p.available_sizes = '[]'::jsonb
                OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements(p.available_sizes) elem
                    WHERE elem->>'size' = filter_size
                      AND (elem->>'quantity')::int > 0
                ))
        ) AS product_count,
        (SELECT COUNT(*) FROM products p2
         JOIN promotions pr ON pr.product_id = p2.id
         WHERE p2.merchant_id = m.id
           AND p2.visible = true
           AND (pr.ends_at IS NULL OR pr.ends_at > NOW())
        ) AS promo_count
    FROM merchants m
    WHERE m.status = 'active'
      AND ST_DWithin(
          m.location::geography,
          ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
          radius_km * 1000
      )
      AND (category_filter IS NULL OR EXISTS (
          SELECT 1 FROM products p2 WHERE p2.merchant_id = m.id AND LOWER(p2.category) = LOWER(category_filter)
      ))
    ORDER BY distance_km
    LIMIT result_limit;
$$;
