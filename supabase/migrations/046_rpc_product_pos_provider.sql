-- Add p_pos_provider parameter to create_product_with_stock RPC
-- so that pos_provider is set at creation time (not only on update)
CREATE OR REPLACE FUNCTION create_product_with_stock(
    p_merchant_id uuid,
    p_name text,
    p_price numeric DEFAULT NULL,
    p_ean text DEFAULT NULL,
    p_photo_url text DEFAULT NULL,
    p_pos_item_id text DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_pos_provider text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
    v_product_id uuid;
BEGIN
    INSERT INTO products (merchant_id, name, price, ean, photo_url, pos_item_id, category, pos_provider)
    VALUES (p_merchant_id, p_name, p_price, p_ean, p_photo_url, p_pos_item_id, p_category, p_pos_provider)
    RETURNING id INTO v_product_id;

    INSERT INTO stock (product_id, quantity)
    VALUES (v_product_id, 0);

    RETURN v_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
