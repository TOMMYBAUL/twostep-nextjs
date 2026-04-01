-- Merchant corrections for AI categorization (for learning)
CREATE TABLE category_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    original_category_id UUID REFERENCES categories(id),
    corrected_category_id UUID NOT NULL REFERENCES categories(id),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_corrections_merchant ON category_corrections(merchant_id);

ALTER TABLE category_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corrections_own" ON category_corrections FOR ALL TO authenticated
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()))
    WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
