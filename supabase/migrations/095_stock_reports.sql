-- 095_stock_reports.sql
-- Boucle de confiance : un consommateur signale "pas en stock sur place" / "mauvais
-- prix" → on enregistre, et assez de signalements récents dégradent l'état affiché
-- (jamais de faux positif ressenti). Sécurité ultime côté consommateur.

CREATE TABLE IF NOT EXISTS stock_reports (
    id           BIGSERIAL PRIMARY KEY,
    product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    merchant_id  uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    reporter_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    reason       text NOT NULL CHECK (reason IN ('not_in_store', 'wrong_price', 'other')),
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_reports_product_recent
    ON stock_reports(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_reports_merchant
    ON stock_reports(merchant_id, created_at DESC);

ALTER TABLE stock_reports ENABLE ROW LEVEL SECURITY;

-- Insert par tout consommateur authentifié ; lecture par le marchand concerné.
DROP POLICY IF EXISTS stock_reports_insert_auth ON stock_reports;
CREATE POLICY stock_reports_insert_auth ON stock_reports
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS stock_reports_select_merchant ON stock_reports;
CREATE POLICY stock_reports_select_merchant ON stock_reports
    FOR SELECT TO authenticated
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

COMMENT ON TABLE stock_reports IS 'Signalements consommateur (pas en stock / mauvais prix) → dégradent la confiance affichée.';
