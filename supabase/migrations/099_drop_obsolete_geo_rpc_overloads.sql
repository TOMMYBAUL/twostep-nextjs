-- 099_drop_obsolete_geo_rpc_overloads.sql  (APPLIQUÉE prod 2026-06-13)
-- Chaque RPC géo avait 2 overloads (avec/sans filter_size). Le param optionnel
-- rendait l'appel sans filter_size ambigu → PGRST203 → /api/feed,
-- /api/products/discover et /api/feed/promos cassées en prod (vérifié en live).
-- Les versions SANS filter_size étaient aussi les obsolètes (sans filtre visible).
-- On droppe les obsolètes ; les versions gardées ont visible=true et
-- filter_size DEFAULT NULL (elles matchent les appels à N args des routes).
-- La RLS products (097/098) couvre archived_at/visible en défense profondeur,
-- ces RPC étant toutes SECURITY INVOKER.

DROP FUNCTION IF EXISTS public.get_feed_nearby(double precision, double precision, integer, double precision, integer);
DROP FUNCTION IF EXISTS public.get_merchants_nearby(double precision, double precision, integer, text, integer);
DROP FUNCTION IF EXISTS public.get_products_nearby(double precision, double precision, integer, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_products_nearby_count(double precision, double precision, integer, text);
DROP FUNCTION IF EXISTS public.get_promos_nearby(double precision, double precision, integer, integer, integer);
