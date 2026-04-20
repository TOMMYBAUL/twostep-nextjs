-- Migration 072 — Clôture du soir sessions (Plan 06)
-- One row per (merchant, date) tracking the end-of-day stock review.
-- Used for: streak gamification, average duration analytics, "déjà fait aujourd'hui" skip.

CREATE TABLE IF NOT EXISTS cloture_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    session_date date NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    variants_marked_out int NOT NULL DEFAULT 0,
    duration_seconds int,
    UNIQUE (merchant_id, session_date)
);

CREATE INDEX IF NOT EXISTS cloture_sessions_merchant_recent
    ON cloture_sessions (merchant_id, session_date DESC);

ALTER TABLE cloture_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merchant_own_cloture_sessions" ON cloture_sessions
    FOR ALL
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()))
    WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
