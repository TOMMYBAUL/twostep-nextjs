-- Stock incoming: products ordered (invoice parsed) but not yet in store
-- Flow: invoice parsed → stock_incoming (incoming) → merchant confirms → stock updated → feed event

CREATE TABLE IF NOT EXISTS stock_incoming (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id),
  invoice_id uuid REFERENCES invoices(id),
  quantity integer NOT NULL,
  status text NOT NULL DEFAULT 'incoming' CHECK (status IN ('incoming', 'received', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  received_at timestamptz
);

-- Index for dashboard queries (show pending deliveries)
CREATE INDEX IF NOT EXISTS idx_stock_incoming_status
  ON stock_incoming(status) WHERE status = 'incoming';

-- RLS: merchants can only see their own incoming stock
ALTER TABLE stock_incoming ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants see own incoming stock"
  ON stock_incoming FOR SELECT
  USING (
    product_id IN (
      SELECT id FROM products WHERE merchant_id IN (
        SELECT id FROM merchants WHERE user_id = auth.uid()
      )
    )
  );
