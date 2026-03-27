-- ══════════════════════════════════════
-- Migration 017: Coach IA tips
-- Two-Step — SP3 coach tips persistence
-- ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS coach_tips (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('insight', 'action')),
    emoji text NOT NULL DEFAULT '💡',
    text text NOT NULL,
    category text NOT NULL CHECK (category IN ('photos', 'stock', 'promos', 'profil', 'engagement')),
    cta_label text,
    cta_href text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_coach_tips_merchant_date ON coach_tips (merchant_id, created_at DESC);
CREATE INDEX idx_coach_tips_merchant_type_date ON coach_tips (merchant_id, type, created_at DESC);

ALTER TABLE coach_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view their own tips"
    ON coach_tips FOR SELECT
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Service role can insert tips"
    ON coach_tips FOR INSERT
    WITH CHECK (true);
