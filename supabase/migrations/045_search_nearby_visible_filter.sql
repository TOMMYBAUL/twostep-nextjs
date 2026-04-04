-- BUG-W6: search_products_nearby was missing visible=true and variant_of IS NULL filters
-- This caused hidden products and variant duplicates to appear in search results.

CREATE OR REPLACE FUNCTION search_products_nearby(
    search_query text,
    user_lat double precision,
    user_lng double precision,
    radius_km integer DEFAULT 5,
    result_limit integer DEFAULT 50
)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    product_price decimal,
    product_photo text,
    product_ean text,
    stock_quantity integer,
    merchant_id uuid,
    merchant_name text,
    merchant_address text,
    merchant_city text,
    distance_km double precision,
    sale_price decimal,
    sale_ends_at timestamptz
) LANGUAGE sql STABLE AS $$
    SELECT
        p.id AS product_id,
        COALESCE(p.canonical_name, p.name) AS product_name,
        p.price AS product_price,
        COALESCE(p.photo_processed_url, p.photo_url) AS product_photo,
        p.ean AS product_ean,
        s.quantity AS stock_quantity,
        m.id AS merchant_id,
        m.name AS merchant_name,
        m.address AS merchant_address,
        m.city AS merchant_city,
        round((ST_Distance(
            m.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
        ) / 1000)::numeric, 1) AS distance_km,
        pr.sale_price,
        pr.ends_at AS sale_ends_at
    FROM products p
    JOIN stock s ON s.product_id = p.id
    JOIN merchants m ON m.id = p.merchant_id
    LEFT JOIN promotions pr ON pr.product_id = p.id
        AND pr.starts_at <= now()
        AND (pr.ends_at IS NULL OR pr.ends_at > now())
    WHERE m.location IS NOT NULL
        AND p.visible = true
        AND p.variant_of IS NULL
        AND ST_DWithin(
            m.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            radius_km * 1000
        )
        AND (
            search_query = ''
            OR to_tsvector('french', coalesce(p.name, '') || ' ' || coalesce(p.category, '') || ' ' || coalesce(p.description, ''))
               @@ plainto_tsquery('french', search_query)
            OR p.ean = search_query
        )
    ORDER BY
        CASE WHEN s.quantity > 0 THEN 0 ELSE 1 END,
        distance_km ASC
    LIMIT result_limit;
$$;
