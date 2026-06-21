-- 102_quality_alerts_ingest_silent.sql  (APPLIQUÉE prod 2026-06-13)
-- Watchdog ingestion : un flux de push qui s'arrête (last_used_at ancien) doit
-- générer une alerte — sinon panne silencieuse et stock mort affiché. Nouveau
-- type 'ingest_silent' (alerte niveau marchand, product_id NULL) + index de dédup
-- dédié (l'index uq_quality_alerts_open porte sur product_id, inopérant quand NULL).
ALTER TABLE quality_alerts DROP CONSTRAINT IF EXISTS quality_alerts_type_check;
ALTER TABLE quality_alerts ADD CONSTRAINT quality_alerts_type_check
    CHECK (type IN ('stock_stale', 'price_aberrant', 'stale_sync', 'ingest_silent'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_alerts_merchant_open
    ON quality_alerts(merchant_id, type)
    WHERE product_id IS NULL AND status = 'open';
