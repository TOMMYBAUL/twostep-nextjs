-- 098_rls_owner_helper_fix.sql  (APPLIQUÉE en prod 2026-06-13, juste après 097)
-- 097 a cassé la lecture anon de products : ses policies products/stock
-- référençaient merchants.user_id dans un sous-select, or 097 vient de révoquer
-- user_id pour anon → "permission denied for table merchants" sur TOUTE lecture
-- anon de products (carte/feed/recherche down). Fix : encapsuler l'ownership dans
-- une fonction SECURITY DEFINER (lit user_id avec les droits owner) — pattern
-- recommandé Supabase pour les policies qui croisent une table à colonnes restreintes.

CREATE OR REPLACE FUNCTION public.auth_owns_merchant(mid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM merchants WHERE id = mid AND user_id = auth.uid()
    );
$$;
REVOKE ALL ON FUNCTION public.auth_owns_merchant(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.auth_owns_merchant(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS products_select_public ON products;
CREATE POLICY products_select_public ON products FOR SELECT
    USING (
        (visible = true AND archived_at IS NULL)
        OR auth_owns_merchant(merchant_id)
    );

DROP POLICY IF EXISTS stock_select_public ON stock;
CREATE POLICY stock_select_public ON stock FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM products p
            WHERE p.id = stock.product_id
              AND (
                  (p.visible = true AND p.archived_at IS NULL)
                  OR auth_owns_merchant(p.merchant_id)
              )
        )
    );
