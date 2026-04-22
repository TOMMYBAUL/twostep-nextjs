-- 080_ean_lookups_extended.sql
-- Cache propriétaire renforcé : taxonomie Two-Step + photo R2 + métriques + recherche fuzzy par nom
-- Plan: docs/superpowers/plans/2026-04-21-enrichissement-unifie.md (Task 1)

-- Extension colonnes
ALTER TABLE ean_lookups
    ADD COLUMN IF NOT EXISTS photo_url_r2 text,
    ADD COLUMN IF NOT EXISTS category_id text,
    ADD COLUMN IF NOT EXISTS subcategory_id text,
    ADD COLUMN IF NOT EXISTS gender text,
    ADD COLUMN IF NOT EXISTS color text,
    ADD COLUMN IF NOT EXISTS tags text[],
    ADD COLUMN IF NOT EXISTS canonical_name_normalized text,
    ADD COLUMN IF NOT EXISTS hit_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_hit_at timestamptz;

-- Extension pg_trgm pour recherche fuzzy (utilisé par searchEanByName via cache)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index trigram pour recherche fuzzy par nom normalisé
CREATE INDEX IF NOT EXISTS idx_ean_lookups_name_trgm
    ON ean_lookups USING gin (canonical_name_normalized gin_trgm_ops);

-- Backfill canonical_name_normalized depuis name existant
-- (no-op si table vide, utile si rows existantes)
UPDATE ean_lookups
SET canonical_name_normalized = lower(regexp_replace(name, '[^a-z0-9\s]', '', 'gi'))
WHERE canonical_name_normalized IS NULL AND name IS NOT NULL;
