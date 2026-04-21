-- 083_ean_lookups_search_by_name.sql
-- RPC for pg_trgm fuzzy search by normalized name (used by searchEanByNameCache)
-- Plan: docs/superpowers/plans/2026-04-21-enrichissement-unifie.md (Task 4)

CREATE OR REPLACE FUNCTION search_ean_lookups_by_name(
  p_normalized_query text,
  p_brand_filter text DEFAULT NULL,
  p_limit int DEFAULT 5
)
RETURNS TABLE (ean text, name text, brand text, category text, similarity real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ean_lookups.ean,
    ean_lookups.name,
    ean_lookups.brand,
    ean_lookups.category,
    similarity(ean_lookups.canonical_name_normalized, p_normalized_query) AS similarity
  FROM ean_lookups
  WHERE
    ean_lookups.canonical_name_normalized IS NOT NULL
    AND ean_lookups.canonical_name_normalized % p_normalized_query
    AND (p_brand_filter IS NULL OR LOWER(ean_lookups.brand) = LOWER(p_brand_filter))
  ORDER BY similarity DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION search_ean_lookups_by_name(text, text, int) TO authenticated, anon, service_role;
