-- 105_quality_alerts_pos_disconnected.sql  (APPLIQUÉE prod 2026-06-17)
-- Watchdog OAuth (revue Collecte ①) : une connexion POS dont le token est mort
-- (last_sync_status='error', refresh échoué = token révoqué/expiré) doit générer
-- une alerte de reconnexion — sinon le marchand ignore que son stock a cessé de
-- se synchroniser. Nouveau type 'pos_disconnected' (alerte niveau marchand).
ALTER TABLE quality_alerts DROP CONSTRAINT IF EXISTS quality_alerts_type_check;
ALTER TABLE quality_alerts ADD CONSTRAINT quality_alerts_type_check
    CHECK (type IN ('stock_stale', 'price_aberrant', 'stale_sync', 'ingest_silent', 'pos_disconnected'));
