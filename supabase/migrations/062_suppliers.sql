-- 062_suppliers.sql
-- Table suppliers scopée par merchant. Créée à la volée à la 1ère facture d'un fournisseur.
-- Pas de cascade vers invoices : supprimer un supplier ne doit pas détruire l'historique des factures.

CREATE TABLE suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    email text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT suppliers_name_not_blank CHECK (length(trim(name)) > 0)
);

-- Unicité (merchant_id, lower(name)) pour éviter les doublons "Fournisseur X" / "fournisseur x"
CREATE UNIQUE INDEX idx_suppliers_merchant_name_lower
    ON suppliers (merchant_id, lower(name));

CREATE INDEX idx_suppliers_merchant ON suppliers (merchant_id);

-- RLS : owner-only (même pattern que invoices/products)
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_select_own" ON suppliers FOR SELECT
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
CREATE POLICY "suppliers_insert_own" ON suppliers FOR INSERT
    WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
CREATE POLICY "suppliers_update_own" ON suppliers FOR UPDATE
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
CREATE POLICY "suppliers_delete_own" ON suppliers FOR DELETE
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- Trigger updated_at (réutilise la fonction existante de 001_initial_schema)
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE suppliers IS 'Fournisseurs marchands, créés à la volée lors de la 1ère facture reçue. Scopé par merchant_id.';
