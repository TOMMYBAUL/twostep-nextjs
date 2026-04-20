-- 065_products_archived_at.sql
-- Soft-delete produits : archived_at IS NULL = actif, NOT NULL = archivé.
-- Les produits archivés restent liés aux factures historiques mais deviennent invisibles côté consumer.

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Index partiel : seuls les produits non-archivés sont d'intérêt pour 99% des queries.
CREATE INDEX IF NOT EXISTS idx_products_active
    ON products (merchant_id) WHERE archived_at IS NULL;

-- Index d'inverse pour la vue "archives" de settings
CREATE INDEX IF NOT EXISTS idx_products_archived
    ON products (merchant_id, archived_at DESC) WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN products.archived_at IS 'Soft-delete timestamp. NULL = produit actif, NOT NULL = archivé (invisible côté consumer, conservé pour historique factures).';

-- ══════════════════════════════════════
-- RPC patch : exclure les produits archivés des queries consumer.
-- ══════════════════════════════════════

-- ──────────────────────────────────────
-- 1/5 : search_products_nearby
-- ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_products_nearby(search_query text, user_lat double precision, user_lng double precision, radius_km integer DEFAULT 5, result_limit integer DEFAULT 50)
 RETURNS TABLE(product_id uuid, product_name text, product_slug text, product_price numeric, product_photo text, product_ean text, stock_quantity integer, merchant_id uuid, merchant_name text, merchant_slug text, merchant_address text, merchant_city text, distance_km double precision, sale_price numeric, sale_ends_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT
        p.id AS product_id,
        COALESCE(p.canonical_name, p.name) AS product_name,
        p.slug AS product_slug,
        p.price AS product_price,
        COALESCE(p.photo_processed_url, p.photo_url) AS product_photo,
        p.ean AS product_ean,
        s.quantity AS stock_quantity,
        m.id AS merchant_id,
        m.name AS merchant_name,
        m.slug AS merchant_slug,
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
        AND p.archived_at IS NULL
        AND ST_DWithin(
            m.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            radius_km * 1000
        )
        AND (
            search_query = ''
            OR to_tsvector('french', coalesce(p.name, '') || ' ' || coalesce(p.canonical_name, '') || ' ' || coalesce(p.category, '') || ' ' || coalesce(p.description, '') || ' ' || coalesce(p.brand, ''))
               @@ plainto_tsquery('french', search_query)
            OR p.ean = search_query
        )
    ORDER BY
        CASE WHEN s.quantity > 0 THEN 0 ELSE 1 END,
        distance_km ASC
    LIMIT result_limit;
$function$;

-- ──────────────────────────────────────
-- 2/5 : get_feed_nearby (sans filter_size)
-- ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_feed_nearby(user_lat double precision, user_lng double precision, radius_km integer DEFAULT 10, cursor_score double precision DEFAULT 999999, result_limit integer DEFAULT 20)
 RETURNS TABLE(product_id uuid, product_name text, product_price numeric, product_photo text, product_ean text, product_brand text, stock_quantity integer, merchant_id uuid, merchant_name text, merchant_address text, merchant_city text, distance_km double precision, event_type text, event_created_at timestamp with time zone, feed_score double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
        -- score = (1 / max(distance_km, 0.1)) * freshness
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
        AND p.archived_at IS NULL
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
    ORDER BY feed_score DESC
    LIMIT result_limit;
$function$;

-- ──────────────────────────────────────
-- 3/5 : get_feed_nearby (avec filter_size)
-- ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_feed_nearby(user_lat double precision, user_lng double precision, radius_km integer DEFAULT 10, cursor_score double precision DEFAULT 999999, result_limit integer DEFAULT 20, filter_size text DEFAULT NULL::text)
 RETURNS TABLE(product_id uuid, product_name text, product_slug text, product_price numeric, product_photo text, product_ean text, product_brand text, stock_quantity integer, merchant_id uuid, merchant_name text, merchant_slug text, merchant_address text, merchant_city text, merchant_photo text, distance_km double precision, event_type text, event_created_at timestamp with time zone, feed_score double precision, sale_price numeric, category text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT
        p.id AS product_id,
        COALESCE(p.canonical_name, p.name) AS product_name,
        p.slug AS product_slug,
        p.price AS product_price,
        COALESCE(p.photo_processed_url, p.photo_url) AS product_photo,
        p.ean AS product_ean,
        p.brand AS product_brand,
        s.quantity AS stock_quantity,
        m.id AS merchant_id,
        m.name AS merchant_name,
        m.slug AS merchant_slug,
        m.address AS merchant_address,
        m.city AS merchant_city,
        m.photo_url AS merchant_photo,
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
        AS feed_score,
        pr.sale_price,
        p.category
    FROM feed_events fe
    JOIN products p ON p.id = fe.product_id
    JOIN stock s ON s.product_id = p.id
    JOIN merchants m ON m.id = fe.merchant_id
    LEFT JOIN promotions pr ON pr.product_id = p.id
        AND pr.starts_at <= now()
        AND (pr.ends_at IS NULL OR pr.ends_at > now())
    WHERE s.quantity > 0
        AND p.archived_at IS NULL
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
$function$;

-- ──────────────────────────────────────
-- 4/5 : get_promos_nearby (sans filter_size)
-- ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_promos_nearby(user_lat double precision, user_lng double precision, radius_km integer DEFAULT 10, result_offset integer DEFAULT 0, result_limit integer DEFAULT 20)
 RETURNS TABLE(promo_id uuid, sale_price numeric, starts_at timestamp with time zone, ends_at timestamp with time zone, product_id uuid, product_name text, product_price numeric, product_photo text, product_ean text, product_brand text, stock_quantity integer, merchant_id uuid, merchant_name text, merchant_address text, merchant_city text, distance_km double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
        AND p.archived_at IS NULL
        AND pr.starts_at <= now()
        AND (pr.ends_at IS NULL OR pr.ends_at > now())
        AND ST_DWithin(
            m.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            radius_km * 1000
        )
    ORDER BY distance_km ASC, pr.ends_at ASC NULLS LAST
    OFFSET result_offset
    LIMIT result_limit;
$function$;

-- ──────────────────────────────────────
-- 5/5 : get_promos_nearby (avec filter_size)
-- ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_promos_nearby(user_lat double precision, user_lng double precision, radius_km integer DEFAULT 10, result_offset integer DEFAULT 0, result_limit integer DEFAULT 20, filter_size text DEFAULT NULL::text)
 RETURNS TABLE(promo_id uuid, sale_price numeric, starts_at timestamp with time zone, ends_at timestamp with time zone, product_id uuid, product_name text, product_slug text, product_price numeric, product_photo text, product_ean text, product_brand text, stock_quantity integer, merchant_id uuid, merchant_name text, merchant_slug text, merchant_address text, merchant_city text, distance_km double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT
        pr.id AS promo_id,
        pr.sale_price,
        pr.starts_at,
        pr.ends_at,
        p.id AS product_id,
        COALESCE(p.canonical_name, p.name) AS product_name,
        p.slug AS product_slug,
        p.price AS product_price,
        COALESCE(p.photo_processed_url, p.photo_url) AS product_photo,
        p.ean AS product_ean,
        p.brand AS product_brand,
        s.quantity AS stock_quantity,
        m.id AS merchant_id,
        m.name AS merchant_name,
        m.slug AS merchant_slug,
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
        AND p.archived_at IS NULL
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
$function$;
