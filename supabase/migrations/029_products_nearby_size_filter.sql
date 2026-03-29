-- Fix get_products_nearby: hide variants, filter by size, only visible products

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
        AND (filter_size IS NULL OR p.available_sizes @> ('[{"size":"' || filter_size || '"}]')::jsonb)
    ORDER BY
        CASE WHEN s.quantity > 0 THEN 0 ELSE 1 END,
        distance_km ASC
    OFFSET result_offset
    LIMIT result_limit;
$$;

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
        AND (filter_size IS NULL OR p.available_sizes @> ('[{"size":"' || filter_size || '"}]')::jsonb);
$$;
