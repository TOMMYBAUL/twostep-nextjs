-- ═══════════════════════════════════════════════════════════════
-- Migration 009: Security Hardening
-- Fixes: update_stock_delta auth, autocomplete injection,
--        missing RLS deny policies on system tables
-- ═══════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- FIX 1: update_stock_delta — add merchant ownership check
-- Previously: any authenticated user could update any product's stock
-- Now: only the merchant who owns the product can update stock
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_stock_delta(p_product_id uuid, p_delta integer)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
    new_qty integer;
    v_merchant_user_id uuid;
BEGIN
    -- Verify caller owns this product via merchant
    SELECT m.user_id INTO v_merchant_user_id
    FROM products p
    JOIN merchants m ON m.id = p.merchant_id
    WHERE p.id = p_product_id;

    IF v_merchant_user_id IS NULL OR v_merchant_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: you do not own this product';
    END IF;

    UPDATE stock
    SET quantity = greatest(0, quantity + p_delta), updated_at = now()
    WHERE product_id = p_product_id
    RETURNING quantity INTO new_qty;

    RETURN coalesce(new_qty, 0);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- FIX 2: autocomplete_suggestions — prevent SQL injection
-- Replace string concatenation with safe parameterized pattern
-- format() with %L (literal) properly escapes user input
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION autocomplete_suggestions(
    query_text TEXT,
    result_limit INT DEFAULT 10
) RETURNS TABLE (
    suggestion TEXT,
    suggestion_type TEXT
) LANGUAGE plpgsql STABLE AS $$
DECLARE
    safe_pattern TEXT;
BEGIN
    -- Sanitize: escape LIKE wildcards and build safe pattern
    safe_pattern := '%' || replace(replace(replace(query_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';

    RETURN QUERY
    (SELECT DISTINCT p.name AS suggestion, 'product'::TEXT AS suggestion_type
     FROM products p JOIN stock s ON s.product_id = p.id
     WHERE s.quantity > 0 AND p.name ILIKE safe_pattern ESCAPE '\'
     LIMIT result_limit)
    UNION ALL
    (SELECT DISTINCT p.brand AS suggestion, 'brand'::TEXT AS suggestion_type
     FROM products p JOIN stock s ON s.product_id = p.id
     WHERE s.quantity > 0 AND p.brand IS NOT NULL AND p.brand ILIKE safe_pattern ESCAPE '\'
     LIMIT 5)
    UNION ALL
    (SELECT DISTINCT p.category AS suggestion, 'category'::TEXT AS suggestion_type
     FROM products p JOIN stock s ON s.product_id = p.id
     WHERE s.quantity > 0 AND p.category IS NOT NULL AND p.category ILIKE safe_pattern ESCAPE '\'
     LIMIT 5);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- FIX 3: Deny INSERT/UPDATE/DELETE on system-write-only tables
-- These tables should only be modified via service_role (admin client)
-- RLS WITH CHECK (false) blocks all non-service-role writes
-- ──────────────────────────────────────────────────────────────

-- ean_lookups: block non-admin writes
CREATE POLICY "ean_lookups_no_insert" ON ean_lookups FOR INSERT WITH CHECK (false);
CREATE POLICY "ean_lookups_no_update" ON ean_lookups FOR UPDATE USING (false);
CREATE POLICY "ean_lookups_no_delete" ON ean_lookups FOR DELETE USING (false);

-- feed_events: block non-admin writes
CREATE POLICY "feed_events_no_insert" ON feed_events FOR INSERT WITH CHECK (false);
CREATE POLICY "feed_events_no_update" ON feed_events FOR UPDATE USING (false);
CREATE POLICY "feed_events_no_delete" ON feed_events FOR DELETE USING (false);

-- platform_metrics: block non-admin writes
CREATE POLICY "platform_metrics_no_insert" ON platform_metrics FOR INSERT WITH CHECK (false);
CREATE POLICY "platform_metrics_no_update" ON platform_metrics FOR UPDATE USING (false);
CREATE POLICY "platform_metrics_no_delete" ON platform_metrics FOR DELETE USING (false);

-- ──────────────────────────────────────────────────────────────
-- FIX 4: stock_incoming — add UPDATE policy for merchants
-- Merchants need to mark incoming stock as "received"
-- ──────────────────────────────────────────────────────────────

CREATE POLICY "stock_incoming_update_own" ON stock_incoming FOR UPDATE
    USING (
        product_id IN (
            SELECT p.id FROM products p
            JOIN merchants m ON m.id = p.merchant_id
            WHERE m.user_id = auth.uid()
        )
    );
