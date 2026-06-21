-- 106_quality_alerts_google_disapproved.sql  (NON APPLIQUÉE — gated, GO Thomas requis)
--
-- Read-back du canal LFP : le cron google-status lit accounts/{account}/products
-- et constate les produits REJETÉS par Google (un 200 sur productInputs:insert ne
-- garantit pas l'acceptation). Pour rendre ce rejet visible au MARCHAND (et pas
-- seulement dans Sentry), on ajoute le type 'google_disapproved' aux quality_alerts.
--
-- ⚠️ Protocole migration §4 : à jouer d'abord sur une branche Supabase de test, puis
--    en prod sur GO. Idempotente + transaction-wrappée.
--
-- Activation côté app : variable Vercel GOOGLE_DISAPPROVAL_ALERTS=1 (le cron n'écrit
-- la table QUE si ce flag est posé — sans la migration ET le flag, l'INSERT
-- échouerait sur la contrainte, cf. LESSONS 081/089).
--
-- Rollback :
--   ALTER TABLE quality_alerts DROP CONSTRAINT IF EXISTS quality_alerts_type_check;
--   ALTER TABLE quality_alerts ADD CONSTRAINT quality_alerts_type_check
--     CHECK (type IN ('stock_stale','price_aberrant','stale_sync','ingest_silent','pos_disconnected'));

BEGIN;

ALTER TABLE quality_alerts DROP CONSTRAINT IF EXISTS quality_alerts_type_check;
ALTER TABLE quality_alerts ADD CONSTRAINT quality_alerts_type_check
    CHECK (type IN ('stock_stale', 'price_aberrant', 'stale_sync', 'ingest_silent', 'pos_disconnected', 'google_disapproved'));

COMMIT;
