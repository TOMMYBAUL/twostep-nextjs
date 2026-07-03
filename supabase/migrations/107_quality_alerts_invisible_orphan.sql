-- 107_quality_alerts_invisible_orphan.sql  (NON APPLIQUÉE — gated, GO Thomas requis)
--
-- Watchdog de complétude « produit vendable rendu INVISIBLE » (north-star §1 « ne rien
-- perdre silencieusement »). Un PRINCIPAL (`variant_of IS NULL`) NON-pending, nommé, avec
-- du stock > 0 mais `visible=false` DEVRAIT être visible (règle de `groupVariantsByEAN`) :
-- s'il ne l'est pas, un chemin l'a laissé masqué/orphelin sans re-groupage (ex. correction
-- manuelle d'EAN → relâche `variant_of` puis regroup échoué ; un marchand sans caisse ni
-- facture n'a aucun re-trigger périodique) → le produit est vendable mais ABSENT du feed
-- Google ET de la vitrine. Le cron `quality-check` le détecte (helper pur `isInvisibleOrphan`)
-- et, pour le rendre visible au MARCHAND (pas seulement dans Sentry), écrit une quality_alert
-- de type 'invisible_orphan'.
--
-- ⚠️ Protocole migration §4 : à jouer d'abord sur une branche Supabase de test, puis en prod
--    sur GO Thomas. Idempotente + transaction-wrappée.
--
-- Activation côté app : variable Vercel INVISIBLE_ORPHAN_ALERTS=1 (le cron n'écrit la table
-- QUE si ce flag est posé — sans la migration ET le flag, l'INSERT échouerait sur la
-- contrainte CHECK, cf. LESSONS 081/089/106). Le COMPTE + le signal Sentry restent actifs
-- SANS migration ni flag → l'invariant « impossible sans alerte » tient dès maintenant.
--
-- Rollback :
--   ALTER TABLE quality_alerts DROP CONSTRAINT IF EXISTS quality_alerts_type_check;
--   ALTER TABLE quality_alerts ADD CONSTRAINT quality_alerts_type_check
--     CHECK (type IN ('stock_stale','price_aberrant','stale_sync','ingest_silent','pos_disconnected','google_disapproved'));

BEGIN;

ALTER TABLE quality_alerts DROP CONSTRAINT IF EXISTS quality_alerts_type_check;
ALTER TABLE quality_alerts ADD CONSTRAINT quality_alerts_type_check
    CHECK (type IN ('stock_stale', 'price_aberrant', 'stale_sync', 'ingest_silent', 'pos_disconnected', 'google_disapproved', 'invisible_orphan'));

COMMIT;
