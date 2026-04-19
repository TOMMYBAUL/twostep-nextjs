-- 063_invoices_supplier_fk.sql
-- Ajoute invoices.supplier_id (FK suppliers) et backfill depuis invoices.supplier_name.
-- Conserve supplier_name (raw IA parse) pour debug et pour invoices sans supplier identifié.

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices (supplier_id) WHERE supplier_id IS NOT NULL;

-- Backfill : créer un supplier pour chaque (merchant_id, supplier_name) distinct
-- ON CONFLICT DO NOTHING permet de rejouer la migration sans effet de bord.
INSERT INTO suppliers (merchant_id, name)
SELECT DISTINCT merchant_id, trim(supplier_name)
FROM invoices
WHERE supplier_name IS NOT NULL
  AND length(trim(supplier_name)) > 0
ON CONFLICT (merchant_id, lower(name)) DO NOTHING;

-- Lier chaque invoice au supplier correspondant
UPDATE invoices AS i
SET supplier_id = s.id
FROM suppliers s
WHERE i.merchant_id = s.merchant_id
  AND lower(trim(i.supplier_name)) = lower(s.name)
  AND i.supplier_id IS NULL;

COMMENT ON COLUMN invoices.supplier_id IS 'FK vers suppliers. NULL si fournisseur non identifié ou parsing IA incomplet. supplier_name reste la trace textuelle brute.';
