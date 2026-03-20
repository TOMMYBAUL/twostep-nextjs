-- ══════════════════════════════════════
-- Migration 003: Phase 1 tables
-- Two-Step Toulouse launch
-- ══════════════════════════════════════

-- ─── Modify existing tables ───

-- merchants: add plan, free_until, launch_cohort
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free'
    CHECK (plan IN ('free', 'standard', 'premium'));
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS free_until timestamptz;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS launch_cohort integer;

-- products: add brand, purchase_price, category_auto
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_price decimal(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_auto text;

-- merchant pos_type: update constraint (add shopify, remove unused values)
-- Safety: NULL out any values that won't be in the new constraint
UPDATE merchants SET pos_type = NULL WHERE pos_type IN ('sumup', 'zettle', 'clover');
ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_pos_type_check;
ALTER TABLE merchants ADD CONSTRAINT merchants_pos_type_check
    CHECK (pos_type IN ('square', 'lightspeed', 'shopify'));

-- ─── New tables ───

-- invoices
CREATE TABLE invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE NOT NULL,
    source text NOT NULL CHECK (source IN ('email', 'upload', 'einvoice')),
    status text NOT NULL DEFAULT 'received'
        CHECK (status IN ('received', 'extracting', 'parsed', 'validated', 'imported', 'failed')),
    file_url text,
    sender_email text,
    supplier_name text,
    received_at timestamptz DEFAULT now(),
    parsed_at timestamptz,
    validated_at timestamptz
);

CREATE INDEX idx_invoices_merchant ON invoices (merchant_id);
CREATE INDEX idx_invoices_status ON invoices (status);

-- invoice_items
CREATE TABLE invoice_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    unit_price_ht decimal(10,2),
    ean text,
    status text NOT NULL DEFAULT 'detected'
        CHECK (status IN ('detected', 'enriched', 'validated', 'rejected')),
    product_id uuid REFERENCES products(id) ON DELETE SET NULL
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items (invoice_id);
CREATE INDEX idx_invoice_items_ean ON invoice_items (ean) WHERE ean IS NOT NULL;

-- email_connections
CREATE TABLE email_connections (
    merchant_id uuid PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('gmail', 'outlook', 'imap')),
    access_token text NOT NULL,
    refresh_token text,
    email_address text NOT NULL,
    last_sync_at timestamptz,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'disconnected')),
    created_at timestamptz DEFAULT now()
);

-- ean_lookups (shared cache)
CREATE TABLE ean_lookups (
    ean text PRIMARY KEY,
    name text NOT NULL,
    brand text,
    photo_url text,
    source text NOT NULL,
    fetched_at timestamptz DEFAULT now()
);

-- feed_events
CREATE TABLE feed_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE NOT NULL,
    product_id uuid REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    event_type text NOT NULL
        CHECK (event_type IN ('new_product', 'restock', 'price_drop', 'new_promo')),
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_feed_events_created ON feed_events (created_at DESC);
CREATE INDEX idx_feed_events_merchant ON feed_events (merchant_id);

-- platform_metrics
CREATE TABLE platform_metrics (
    key text PRIMARY KEY,
    value integer NOT NULL DEFAULT 0,
    updated_at timestamptz DEFAULT now()
);

-- Initialize metrics
INSERT INTO platform_metrics (key, value) VALUES
    ('toulouse_users_count', 0),
    ('launch_date', 0);

-- ─── RLS Policies ───

-- invoices: owner-only
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select_own" ON invoices FOR SELECT
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
CREATE POLICY "invoices_insert_own" ON invoices FOR INSERT
    WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
CREATE POLICY "invoices_update_own" ON invoices FOR UPDATE
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
CREATE POLICY "invoices_delete_own" ON invoices FOR DELETE
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- invoice_items: via invoice ownership
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_items_select_own" ON invoice_items FOR SELECT
    USING (invoice_id IN (
        SELECT i.id FROM invoices i
        JOIN merchants m ON m.id = i.merchant_id
        WHERE m.user_id = auth.uid()
    ));
CREATE POLICY "invoice_items_insert_own" ON invoice_items FOR INSERT
    WITH CHECK (invoice_id IN (
        SELECT i.id FROM invoices i
        JOIN merchants m ON m.id = i.merchant_id
        WHERE m.user_id = auth.uid()
    ));
CREATE POLICY "invoice_items_update_own" ON invoice_items FOR UPDATE
    USING (invoice_id IN (
        SELECT i.id FROM invoices i
        JOIN merchants m ON m.id = i.merchant_id
        WHERE m.user_id = auth.uid()
    ));

-- email_connections: owner-only
ALTER TABLE email_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_conn_select_own" ON email_connections FOR SELECT
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
CREATE POLICY "email_conn_insert_own" ON email_connections FOR INSERT
    WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
CREATE POLICY "email_conn_update_own" ON email_connections FOR UPDATE
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
CREATE POLICY "email_conn_delete_own" ON email_connections FOR DELETE
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- ean_lookups: public read, system write only
ALTER TABLE ean_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ean_lookups_select_all" ON ean_lookups FOR SELECT USING (true);
-- Insert/update only via service_role (admin client)

-- feed_events: public read, system write only
ALTER TABLE feed_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_events_select_all" ON feed_events FOR SELECT USING (true);
-- Insert only via service_role (admin client)

-- platform_metrics: public read, admin write only
ALTER TABLE platform_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_metrics_select_all" ON platform_metrics FOR SELECT USING (true);
-- Update only via service_role (admin client)

-- ─── Supabase Storage bucket ───
-- Run in Supabase dashboard: create bucket 'invoices' (private)

-- ─── RPC: Feed query ───
CREATE OR REPLACE FUNCTION get_feed_nearby(
    user_lat double precision,
    user_lng double precision,
    radius_km integer DEFAULT 10,
    cursor_score double precision DEFAULT 999999,
    result_limit integer DEFAULT 20
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
$$;

-- ─── RPC: Promos feed (geo-sorted) ───
CREATE OR REPLACE FUNCTION get_promos_nearby(
    user_lat double precision,
    user_lng double precision,
    radius_km integer DEFAULT 10,
    result_offset integer DEFAULT 0,
    result_limit integer DEFAULT 20
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
$$;
