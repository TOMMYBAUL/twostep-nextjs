-- 094_quality_alerts.sql
-- Monitoring qualité : alertes stock figé / prix aberrant / sync périmé.
-- Alimenté par le cron /api/cron/quality-check, lu par le dashboard marchand.

CREATE TABLE IF NOT EXISTS quality_alerts (
    id           BIGSERIAL PRIMARY KEY,
    merchant_id  uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product_id   uuid REFERENCES products(id) ON DELETE CASCADE,
    type         text NOT NULL CHECK (type IN ('stock_stale', 'price_aberrant', 'stale_sync')),
    detail       jsonb,
    status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    resolved_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_quality_alerts_merchant_status
    ON quality_alerts(merchant_id, status);

-- Un seul alerte OUVERTE par (produit, type) — évite les doublons à chaque passage cron.
CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_alerts_open
    ON quality_alerts(product_id, type)
    WHERE status = 'open';

ALTER TABLE quality_alerts ENABLE ROW LEVEL SECURITY;

-- Le marchand lit/gère ses propres alertes ; service_role (cron) écrit.
DROP POLICY IF EXISTS quality_alerts_owner ON quality_alerts;
CREATE POLICY quality_alerts_owner ON quality_alerts
    FOR ALL TO authenticated
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()))
    WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

COMMENT ON TABLE quality_alerts IS 'Alertes qualité données (stock figé, prix aberrant) — cron quality-check.';
