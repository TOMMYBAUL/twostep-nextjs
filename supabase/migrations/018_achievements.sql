-- ══════════════════════════════════════
-- Migration 018: Achievements (SP5)
-- Two-Step — milestone celebrations
-- ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS achievements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    type text NOT NULL,
    unlocked_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(merchant_id, type)
);

CREATE INDEX idx_achievements_merchant ON achievements(merchant_id, unlocked_at DESC);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

-- Marchand voit ses propres achievements
CREATE POLICY "Merchants can view their own achievements"
    ON achievements FOR SELECT
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- Service role insère
CREATE POLICY "Service role can insert achievements"
    ON achievements FOR INSERT
    WITH CHECK (true);

-- Lecture publique pour badges prestigieux (profil consumer)
CREATE POLICY "Public can read prestigious badges"
    ON achievements FOR SELECT
    USING (type IN ('score-80', 'streak-7'));
