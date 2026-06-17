-- 104_stock_source_tracking.sql  (APPLIQUÉE prod 2026-06-17)
-- CŒUR "data propre" : tracer l'ORIGINE de chaque écriture de stock.
-- Avant : la table stock ne portait que {quantity, updated_at} → la confidence
-- DÉDUISAIT la source du pos_item_id (pouvait mentir : un produit POS ajusté à la
-- main restait classé "temps réel"). Désormais chaque writer déclare sa source.
-- Bénéfices : (1) confidence HONNÊTE (lit stock.source réel), (2) garde
-- anti-régression (un REPLACE plus ancien n'écrase pas une vérité plus fraîche).
-- La résolution multi-source complète (ledger append-only) reste différée.

ALTER TABLE stock
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
        CHECK (source IN ('webhook','pos_sync','file_push','scan','invoice','cloture','manual')),
    ADD COLUMN IF NOT EXISTS source_ts timestamptz NOT NULL DEFAULT now();

-- Remplace la signature 3-args par 5-args (DROP+CREATE pour éviter un overload
-- ambigu PGRST203). Les appels existants à 3 params nommés résolvent vers les DEFAULT.
DROP FUNCTION IF EXISTS update_stock_atomic(uuid, int, text);

CREATE OR REPLACE FUNCTION update_stock_atomic(
    p_product_id uuid,
    p_quantity int,
    p_mode text DEFAULT 'absolute',
    p_source text DEFAULT 'manual',
    p_source_ts timestamptz DEFAULT now()
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_previous int;
    v_prev_ts  timestamptz;
    v_new int;
BEGIN
    SELECT quantity, source_ts INTO v_previous, v_prev_ts
    FROM stock WHERE product_id = p_product_id FOR UPDATE;

    IF NOT FOUND THEN
        v_new := GREATEST(0, p_quantity);
        INSERT INTO stock (product_id, quantity, source, source_ts)
        VALUES (p_product_id, v_new, p_source, p_source_ts);
        RETURN 0;
    END IF;

    IF p_mode = 'delta' THEN
        v_new := GREATEST(0, v_previous + p_quantity);
    ELSE
        -- REPLACE absolu : on n'écrase PAS avec une vérité plus ANCIENNE.
        IF p_source_ts < v_prev_ts THEN
            RETURN v_previous;
        END IF;
        v_new := GREATEST(0, p_quantity);
    END IF;

    UPDATE stock
    SET quantity = v_new, updated_at = now(), source = p_source, source_ts = p_source_ts
    WHERE product_id = p_product_id;

    RETURN v_previous;
END;
$$;
