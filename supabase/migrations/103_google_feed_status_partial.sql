-- 103_google_feed_status_partial.sql  (APPLIQUÉE prod 2026-06-14)
-- Le cron google-feed écrit last_feed_status='partial' (push incomplet : certains
-- produits éligibles ont échoué) mais la CHECK de 037 n'autorisait que
-- pending/success/error → l'UPDATE échouait silencieusement à chaque feed partiel
-- (statut figé sur l'ancienne valeur, marchand mal informé). Découvert par l'audit
-- du canal LFP (2026-06-14).
ALTER TABLE google_merchant_connections DROP CONSTRAINT IF EXISTS google_merchant_connections_last_feed_status_check;
ALTER TABLE google_merchant_connections ADD CONSTRAINT google_merchant_connections_last_feed_status_check
    CHECK (last_feed_status IN ('pending', 'success', 'partial', 'error'));
