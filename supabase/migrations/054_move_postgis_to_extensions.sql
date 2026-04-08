-- Move PostGIS from public schema to extensions schema
-- Fixes Supabase linter warning: extension_in_public

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage to necessary roles
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Move PostGIS to extensions schema
ALTER EXTENSION postgis SET SCHEMA extensions;

-- Ensure PostGIS functions are accessible without schema prefix
-- by adding extensions to the search_path
ALTER DATABASE postgres SET search_path TO public, extensions;
