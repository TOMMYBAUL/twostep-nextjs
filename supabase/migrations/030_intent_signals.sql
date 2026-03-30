-- Intent signals: "J'arrive" — consumer signals intent to visit a merchant for a product
CREATE TABLE intent_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    selected_size TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '2 hours'
);

ALTER TABLE intent_signals ENABLE ROW LEVEL SECURITY;

-- Consumers can create and read their own signals
CREATE POLICY "intent_insert_own" ON intent_signals
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "intent_select_own" ON intent_signals
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Merchants can read signals for their products
CREATE POLICY "intent_select_merchant" ON intent_signals
    FOR SELECT TO authenticated
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- Indexes
CREATE INDEX idx_intent_signals_merchant ON intent_signals(merchant_id, created_at DESC);
CREATE INDEX idx_intent_signals_expires ON intent_signals(expires_at) WHERE status = 'active';
CREATE INDEX idx_intent_signals_user ON intent_signals(user_id, created_at DESC);
