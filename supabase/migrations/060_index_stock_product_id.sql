-- Index on stock(product_id) for fast joins in feed/search RPCs
CREATE INDEX IF NOT EXISTS idx_stock_product_id ON stock(product_id);

-- Also index stock(product_id, quantity) for filtered joins (WHERE quantity > 0)
CREATE INDEX IF NOT EXISTS idx_stock_product_id_qty ON stock(product_id) WHERE quantity > 0;
