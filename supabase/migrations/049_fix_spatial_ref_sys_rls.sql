-- Fix Supabase security linter warning: spatial_ref_sys without RLS
-- This is a PostGIS system table with public reference data (coordinate systems).
-- No sensitive data, but we enable RLS + public read to silence the alert.

ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spatial_ref_sys_public_read" ON public.spatial_ref_sys
  FOR SELECT USING (true);
