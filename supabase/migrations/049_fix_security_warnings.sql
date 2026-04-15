-- ══════════════════════════════════════
-- Migration 049: Fix Supabase security warnings
-- ══════════════════════════════════════

-- 1. Fix search_path on ALL functions (prevents schema injection)
ALTER FUNCTION public.get_categories_tree SET search_path = public;
ALTER FUNCTION public.search_products_nearby SET search_path = public;
ALTER FUNCTION public.get_promos_nearby SET search_path = public;
ALTER FUNCTION public.receive_stock_incoming SET search_path = public;
ALTER FUNCTION public.create_product_with_stock SET search_path = public;
ALTER FUNCTION public.get_products_nearby SET search_path = public;
ALTER FUNCTION public.get_merchants_nearby SET search_path = public;
ALTER FUNCTION public.get_products_nearby_count SET search_path = public;
ALTER FUNCTION public.get_feed_nearby SET search_path = public;
ALTER FUNCTION public.autocomplete_suggestions SET search_path = public;
ALTER FUNCTION public.update_updated_at SET search_path = public;
ALTER FUNCTION public.update_stock_delta SET search_path = public;
ALTER FUNCTION public.generate_slug SET search_path = public;
ALTER FUNCTION public.set_slug_on_insert SET search_path = public;
ALTER FUNCTION public.get_merchant_profile SET search_path = public;
ALTER FUNCTION public.get_filter_values SET search_path = public;

-- 2. Fix categories: only merchants can write their own categories, not any authenticated user
DROP POLICY IF EXISTS "categories_auth_write" ON public.categories;

-- Categories are managed by the system (service_role) during sync and AI categorization
-- Authenticated users can only read
CREATE POLICY "categories_read_all" ON public.categories
  FOR SELECT USING (true);

-- 3. Fix achievements: restrict INSERT to service_role only (not anonymous)
DROP POLICY IF EXISTS "Service role can insert achievements" ON public.achievements;

-- Achievements are inserted by the backend (service_role), not by users directly
-- The existing SELECT policy lets users read their own achievements

-- 4. Fix page_views: restrict INSERT to authenticated users only (prevent anonymous spam)
DROP POLICY IF EXISTS "Anyone can insert page views" ON public.page_views;

CREATE POLICY "Authenticated users can insert page views" ON public.page_views
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
