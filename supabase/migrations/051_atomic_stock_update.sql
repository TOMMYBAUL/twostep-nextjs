CREATE OR REPLACE FUNCTION update_stock_atomic(
    p_product_id uuid,
    p_quantity int,
    p_mode text DEFAULT 'absolute'
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_previous int;
    v_new int;
BEGIN
    SELECT quantity INTO v_previous
    FROM stock
    WHERE product_id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        v_previous := 0;
        v_new := GREATEST(0, CASE WHEN p_mode = 'delta' THEN p_quantity ELSE p_quantity END);
        INSERT INTO stock (product_id, quantity) VALUES (p_product_id, v_new);
    ELSE
        IF p_mode = 'delta' THEN
            v_new := GREATEST(0, v_previous + p_quantity);
        ELSE
            v_new := GREATEST(0, p_quantity);
        END IF;
        UPDATE stock SET quantity = v_new, updated_at = now()
        WHERE product_id = p_product_id;
    END IF;

    RETURN v_previous;
END;
$$;
