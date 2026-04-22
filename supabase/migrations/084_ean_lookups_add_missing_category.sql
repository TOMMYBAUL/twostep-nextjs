-- 084_ean_lookups_add_missing_category.sql
-- Fix: migration 006 added `category` to ean_lookups in code but was never applied to prod DB.
-- The column is referenced by src/lib/ean/lookup.ts (cacheResult, fetchEanData) and the new
-- Task 4 RPC search_ean_lookups_by_name. Re-applying defensively here.

ALTER TABLE ean_lookups
    ADD COLUMN IF NOT EXISTS category text;
