-- 092_security_hardening.sql
-- Durcissement sécurité — audit du 2026-06-12 (confirmé par Supabase advisors lints 0011/0013/0028/0029).
--
-- Contexte vérifié dans le code AVANT écriture (pour ne rien casser) :
--   - 6 RPC ci-dessous ne sont appelées QUE via createAdminClient() (service_role) :
--     update_stock_atomic        → /api/stock (admin), webhooks square/shopify/zettle/lightspeed (admin)
--     receive_stock_incoming     → /api/stock/receive (adminSupabase)
--     claim_image_jobs           → /api/images/process (admin + CRON_SECRET)
--     claim_signup_slot          → src/lib/stripe/plans.ts (createAdminClient)
--     increment_ean_hit_count    → src/lib/enrichment/telemetry.ts (createAdminClient)
--     search_ean_lookups_by_name → src/lib/ean/lookup.ts (createAdminClient)
--     → service_role IGNORE les GRANT : révoquer anon+authenticated ne casse rien.
--   - create_product_with_stock est appelée par sync-engine via createClient() (contexte
--     authenticated du marchand, jamais cron/webhook). On NE révoque PAS authenticated :
--     on ajoute un contrôle d'appartenance interne + on révoque anon uniquement.
--
-- NON inclus ici volontairement (nécessitent un changement de code, pas juste du SQL) :
--   - Restriction des colonnes sensibles de merchants (billing_status lu par le middleware
--     sur chaque requête en contexte authenticated → un REVOKE de colonnes casserait le gate).
--     Fix dédié : vue publique merchants_public + repointage des lectures consumer. Voir rapport §8.
--   - Correctif perf des 59 policies auth_rls_initplan → migration 093 séparée.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RPC admin-only : révoquer l'exécution par anon et authenticated
--    (service_role conserve l'accès et bypass les GRANT)
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.update_stock_atomic(uuid, integer, text)            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.receive_stock_incoming(uuid, uuid, integer, uuid)   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_image_jobs(integer)                           FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_signup_slot(uuid)                             FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_ean_hit_count(text)                       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.search_ean_lookups_by_name(text, text, integer)     FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. claim_signup_slot : fixer search_path (lint 0011) — corps inchangé.
--    Impact business : empêche un tiers d'attribuer un rang d'inscription (→ facturation).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_signup_slot(p_merchant_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_existing_rank INTEGER;
    v_next_rank INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('signup_slot_claim'));

    SELECT signup_order_rank INTO v_existing_rank
    FROM merchants WHERE id = p_merchant_id;

    IF v_existing_rank IS NOT NULL THEN
        RETURN v_existing_rank;
    END IF;

    SELECT COALESCE(MAX(signup_order_rank), 0) + 1 INTO v_next_rank
    FROM merchants;

    UPDATE merchants
    SET signup_order_rank = v_next_rank
    WHERE id = p_merchant_id;

    RETURN v_next_rank;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. create_product_with_stock (2 surcharges) : contrôle d'appartenance interne.
--    Garde : si un appelant authentifié est présent (auth.uid() non nul), il DOIT
--    posséder le marchand cible. Les appels service_role (auth.uid() nul) restent
--    autorisés (admin/onboarding éventuel). anon est révoqué ci-dessous.
--    Le sync-engine tourne en contexte authenticated du marchand → la garde passe.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_product_with_stock(
    p_merchant_id uuid, p_name text, p_price numeric DEFAULT NULL::numeric,
    p_ean text DEFAULT NULL::text, p_photo_url text DEFAULT NULL::text,
    p_pos_item_id text DEFAULT NULL::text, p_category text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_product_id uuid;
BEGIN
    IF auth.uid() IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM merchants WHERE id = p_merchant_id AND user_id = auth.uid())
    THEN
        RAISE EXCEPTION 'Unauthorized: merchant % does not belong to caller', p_merchant_id;
    END IF;

    INSERT INTO products (merchant_id, name, price, ean, photo_url, pos_item_id, category)
    VALUES (p_merchant_id, p_name, p_price, p_ean, p_photo_url, p_pos_item_id, p_category)
    RETURNING id INTO v_product_id;

    INSERT INTO stock (product_id, quantity)
    VALUES (v_product_id, 0);

    RETURN v_product_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_product_with_stock(
    p_merchant_id uuid, p_name text, p_price numeric DEFAULT NULL::numeric,
    p_ean text DEFAULT NULL::text, p_photo_url text DEFAULT NULL::text,
    p_pos_item_id text DEFAULT NULL::text, p_category text DEFAULT NULL::text,
    p_pos_provider text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_product_id uuid;
BEGIN
    IF auth.uid() IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM merchants WHERE id = p_merchant_id AND user_id = auth.uid())
    THEN
        RAISE EXCEPTION 'Unauthorized: merchant % does not belong to caller', p_merchant_id;
    END IF;

    INSERT INTO products (merchant_id, name, price, ean, photo_url, pos_item_id, category, pos_provider)
    VALUES (p_merchant_id, p_name, p_price, p_ean, p_photo_url, p_pos_item_id, p_category, p_pos_provider)
    RETURNING id INTO v_product_id;

    INSERT INTO stock (product_id, quantity)
    VALUES (v_product_id, 0);

    RETURN v_product_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_product_with_stock(uuid, text, numeric, text, text, text, text)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_product_with_stock(uuid, text, numeric, text, text, text, text, text)  FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. receive_stock_incoming : garde d'appartenance interne (défense en profondeur,
--    en plus du REVOKE). Corps d'origine préservé.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.receive_stock_incoming(
    p_incoming_id uuid, p_product_id uuid, p_delta integer, p_merchant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM merchants WHERE id = p_merchant_id AND user_id = auth.uid())
    THEN
        RAISE EXCEPTION 'Unauthorized: merchant % does not belong to caller', p_merchant_id;
    END IF;

    PERFORM update_stock_delta(p_product_id, p_delta);

    UPDATE stock_incoming
    SET status = 'received', received_at = now()
    WHERE id = p_incoming_id;

    INSERT INTO feed_events (merchant_id, product_id, event_type, created_at)
    VALUES (p_merchant_id, p_product_id, 'restock', now());
END;
$function$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. spatial_ref_sys (PostGIS) — NE PEUT PAS être corrigé ici.
--    Vérifié en prod le 2026-06-12 : la table est détenue par `supabase_admin`,
--    et le rôle `anon` a des droits arwd (INSERT/UPDATE/DELETE) accordés PAR
--    supabase_admin. Ni `ALTER TABLE ... ENABLE RLS` ni `REVOKE` ne fonctionnent
--    depuis le rôle `postgres` (ni erreur ni effet pour le REVOKE — no-op).
--    => Risque : un client anon pourrait corrompre la table de référence PostGIS
--       via l'API REST et casser les requêtes géo (déni de fonctionnement).
--    => CORRECTIF : ticket support Supabase demandant SOIT de déplacer l'extension
--       postgis hors du schéma public (fix recommandé, règle aussi le lint 0014),
--       SOIT d'activer la RLS / révoquer les droits anon sur spatial_ref_sys.
--    Statement volontairement RETIRÉ de cette migration pour ne pas la faire échouer.
