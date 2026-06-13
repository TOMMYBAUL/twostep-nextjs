-- 097_rls_lockdown_products_merchants_stock.sql
-- FAILLE (audit 2026-06-13, vérifiée en live via clé anon publique) : les policies
-- SELECT de 001 sont restées `USING (true)` sur products, stock et merchants.
-- - merchants : fuite AVÉRÉE (user_id, siret, stripe_customer_id, plan,
--   inbound_email_slug...) lisibles par quiconque a la clé anon (publique, repo public).
-- - products/stock : aucune fuite AUJOURD'HUI seulement parce qu'aucun produit
--   visible=false n'existe encore ; au 1er marchand avec des produits pending/masked,
--   tout son catalogue privé fuite. Bombe à retardement.
--
-- Fix : policies SELECT resserrées (public = visible+non-archivé / actif ; le
-- propriétaire garde tout) + column-grant anon sur merchants (liste blanche
-- d'affichage, le noyau facturation/PII/CRM révoqué).

-- NB : policies products/stock recréées en forme finale par 098 (SECURITY DEFINER).
-- Toutes les instructions ici sont idempotentes (DROP IF EXISTS avant CREATE) pour
-- être rejouables sans erreur "policy already exists".

-- ── products ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS products_select_all ON products;
DROP POLICY IF EXISTS products_select_public ON products;
CREATE POLICY products_select_public ON products FOR SELECT
    USING (
        (visible = true AND archived_at IS NULL)
        OR merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())
    );

-- ── stock (rattaché au produit) ───────────────────────────────────────────────
DROP POLICY IF EXISTS stock_select_all ON stock;
DROP POLICY IF EXISTS stock_select_public ON stock;
CREATE POLICY stock_select_public ON stock FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM products p
            WHERE p.id = stock.product_id
              AND (
                  (p.visible = true AND p.archived_at IS NULL)
                  OR p.merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())
              )
        )
    );

-- ── merchants : lignes (actifs + les siennes) ────────────────────────────────
DROP POLICY IF EXISTS merchants_select_all ON merchants;
DROP POLICY IF EXISTS merchants_select_public ON merchants;
CREATE POLICY merchants_select_public ON merchants FOR SELECT
    USING (status = 'active' OR user_id = auth.uid());

-- ── merchants : colonnes exposées à anon (liste blanche d'affichage) ──────────
-- Révoque tout pour anon puis ré-accorde uniquement les colonnes publiques.
-- `authenticated` et `service_role` conservent l'accès complet (dashboard marchand,
-- routes admin via service_role) — non touchés ici.
REVOKE SELECT ON merchants FROM anon;
GRANT SELECT (
    id, name, slug, address, city, description, location,
    logo_url, photo_url, cover_photo_url, phone, opening_hours,
    pos_type, status, created_at, updated_at, primary_category_id,
    instagram_url, tiktok_url, website_url, links, has_online_store,
    launch_cohort, signup_order_rank, naf_code
) ON merchants TO anon;

COMMENT ON POLICY products_select_public ON products IS
    'Public : visible + non archivé ; propriétaire : tous ses produits. Ferme la fuite catalogue privé.';
COMMENT ON POLICY merchants_select_public ON merchants IS
    'Public : marchands actifs ; propriétaire : sa fiche. Colonnes anon restreintes par column-grant (097).';
