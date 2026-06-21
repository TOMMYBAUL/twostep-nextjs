-- 101_ingest_lock_and_idempotence.sql  (APPLIQUÉE prod 2026-06-13)
-- Anti-concurrence + idempotence du push d'ingestion (findings audit archi #3, #6).
-- ingesting_since : verrou applicatif (pattern syncing_since de 050) — un push en
-- cours empêche un push concurrent du même marchand (cron 15 min qui chevauche,
-- ou retry réseau) ; sinon races sur stock/réconciliation. last_file_hash : un
-- fichier identique au précédent (export inchangé, boutique fermée) = no-op
-- immédiat au lieu de reparser + retraiter tout le catalogue toutes les 15 min.
ALTER TABLE ingest_credentials
    ADD COLUMN IF NOT EXISTS ingesting_since timestamptz,
    ADD COLUMN IF NOT EXISTS last_file_hash text;
