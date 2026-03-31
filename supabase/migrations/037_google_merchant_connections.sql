-- Google Merchant Center connections (one per merchant)
CREATE TABLE google_merchant_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE UNIQUE NOT NULL,
    google_merchant_id text NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamptz NOT NULL,
    store_code text NOT NULL,
    products_pushed integer DEFAULT 0,
    last_feed_at timestamptz,
    last_feed_status text DEFAULT 'pending'
        CHECK (last_feed_status IN ('pending', 'success', 'error')),
    last_feed_error text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_google_merchant_connections_merchant ON google_merchant_connections(merchant_id);

ALTER TABLE google_merchant_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merchants_own_google_connection"
    ON google_merchant_connections FOR ALL
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
