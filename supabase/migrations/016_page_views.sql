-- ══════════════════════════════════════
-- Migration 016: Page views + favorites merchant_id
-- Two-Step — discovery funnel analytics
-- ══════════════════════════════════════

-- ─── page_views ───
CREATE TABLE IF NOT EXISTS page_views (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    viewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    page_type text NOT NULL DEFAULT 'shop',
    product_id uuid REFERENCES products(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_page_views_merchant_date ON page_views (merchant_id, created_at DESC);

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert page views"
    ON page_views FOR INSERT WITH CHECK (true);

CREATE POLICY "Merchants can view their own page views"
    ON page_views FOR SELECT
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- ─── user_favorites: add merchant_id (discovery funnel) ───
ALTER TABLE user_favorites ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_favorites_merchant ON user_favorites(merchant_id);
