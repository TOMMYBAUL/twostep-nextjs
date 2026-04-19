-- 068_invoice_ux_status.sql
-- Mapping des 6 status internes invoices → 3 états UX + RPC helpers pour Plans 04/06.

-- ══════════════════════════════════════
-- Generated column : ux_status
-- ══════════════════════════════════════
-- Mapping :
--   received/extracting/parsed → pending (en attente action marchand)
--   validated/imported         → validated (marchand a validé)
--   failed                     → refused

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS ux_status text GENERATED ALWAYS AS (
        CASE
            WHEN status IN ('received', 'extracting', 'parsed') THEN 'pending'
            WHEN status IN ('validated', 'imported') THEN 'validated'
            WHEN status = 'failed' THEN 'refused'
        END
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_invoices_ux_status
    ON invoices (merchant_id, ux_status);

COMMENT ON COLUMN invoices.ux_status IS 'Vue UX agrégée (pending|validated|refused) dérivée de status. Stored generated — à utiliser dans les queries UI.';

-- ══════════════════════════════════════
-- RPC : toggle_stock_status
-- ══════════════════════════════════════

CREATE OR REPLACE FUNCTION toggle_stock_status(p_product_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_merchant_id uuid;
    v_new_status text;
BEGIN
    SELECT p.merchant_id INTO v_merchant_id
    FROM products p
    JOIN merchants m ON m.id = p.merchant_id
    WHERE p.id = p_product_id
      AND m.user_id = auth.uid();

    IF v_merchant_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized or product not found';
    END IF;

    UPDATE stock
    SET status = CASE WHEN status = 'available' THEN 'out_of_stock' ELSE 'available' END
    WHERE product_id = p_product_id
    RETURNING status INTO v_new_status;

    RETURN v_new_status;
END;
$$;

-- ══════════════════════════════════════
-- RPC : bulk_set_out_of_stock (clôture du soir)
-- ══════════════════════════════════════

CREATE OR REPLACE FUNCTION bulk_set_out_of_stock(p_product_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    IF EXISTS (
        SELECT 1 FROM unnest(p_product_ids) AS pid
        WHERE pid NOT IN (
            SELECT p.id FROM products p
            JOIN merchants m ON m.id = p.merchant_id
            WHERE m.user_id = auth.uid()
        )
    ) THEN
        RAISE EXCEPTION 'Unauthorized: at least one product does not belong to the user';
    END IF;

    UPDATE stock
    SET status = 'out_of_stock'
    WHERE product_id = ANY(p_product_ids)
      AND status = 'available';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ══════════════════════════════════════
-- RPC : archive_product (soft-delete)
-- ══════════════════════════════════════

CREATE OR REPLACE FUNCTION archive_product(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE products
    SET archived_at = now()
    WHERE id = p_product_id
      AND merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid());

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized or product not found';
    END IF;
END;
$$;

-- Grants (RPC appelables par l'user authentifié)
GRANT EXECUTE ON FUNCTION toggle_stock_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_set_out_of_stock(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION archive_product(uuid) TO authenticated;
