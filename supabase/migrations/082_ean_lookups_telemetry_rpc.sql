-- 082_ean_lookups_telemetry_rpc.sql
-- RPC for atomic hit_count increment (used by src/lib/enrichment/telemetry.ts)
-- Plan: docs/superpowers/plans/2026-04-21-enrichissement-unifie.md (Task 2)

CREATE OR REPLACE FUNCTION increment_ean_hit_count(p_ean text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ean_lookups
  SET hit_count = hit_count + 1,
      last_hit_at = now()
  WHERE ean = p_ean;
END;
$$;

-- Allow authenticated callers to invoke (RLS policies on the table still apply)
GRANT EXECUTE ON FUNCTION increment_ean_hit_count(text) TO authenticated, anon, service_role;
