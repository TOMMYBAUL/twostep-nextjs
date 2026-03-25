-- Atomic product creation with stock row
-- Used by invoice validation and POS sync
CREATE OR REPLACE FUNCTION create_product_with_stock(
    p_merchant_id uuid,
    p_name text,
    p_price numeric DEFAULT NULL,
    p_ean text DEFAULT NULL,
    p_photo_url text DEFAULT NULL,
    p_pos_item_id text DEFAULT NULL,
    p_category text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
    v_product_id uuid;
BEGIN
    INSERT INTO products (merchant_id, name, price, ean, photo_url, pos_item_id, category)
    VALUES (p_merchant_id, p_name, p_price, p_ean, p_photo_url, p_pos_item_id, p_category)
    RETURNING id INTO v_product_id;

    INSERT INTO stock (product_id, quantity)
    VALUES (v_product_id, 0);

    RETURN v_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic stock receive: update quantity + mark incoming as received + create feed event
-- Used by /api/stock/receive and email cron delivery confirmation
CREATE OR REPLACE FUNCTION receive_stock_incoming(
    p_incoming_id uuid,
    p_product_id uuid,
    p_delta integer,
    p_merchant_id uuid
) RETURNS void AS $$
BEGIN
    -- Update actual stock
    PERFORM update_stock_delta(p_product_id, p_delta);

    -- Mark incoming as received
    UPDATE stock_incoming
    SET status = 'received', received_at = now()
    WHERE id = p_incoming_id;

    -- Create feed event
    INSERT INTO feed_events (merchant_id, product_id, event_type, created_at)
    VALUES (p_merchant_id, p_product_id, 'restock', now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
