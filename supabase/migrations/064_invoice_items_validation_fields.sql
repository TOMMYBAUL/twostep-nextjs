-- 064_invoice_items_validation_fields.sql
-- Support de la validation ligne par ligne (§7.2 spec) + flags IA pour EAN non reconnu / nouveau produit.
-- quantity existant reste utilisé par le code applicatif ; facture_qty et received_qty le précisent.

ALTER TABLE invoice_items
    ADD COLUMN IF NOT EXISTS facture_qty integer,
    ADD COLUMN IF NOT EXISTS received_qty integer,
    ADD COLUMN IF NOT EXISTS is_flagged boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS flag_reason text;

-- Backfill : facture_qty = quantity (c'était implicitement la quantité facturée jusqu'ici)
UPDATE invoice_items SET facture_qty = quantity WHERE facture_qty IS NULL;

-- Contrainte de cohérence : si flag_reason est posé, is_flagged doit être true.
-- Les valeurs de flag_reason sont libres en V1 (pas de CHECK strict) pour laisser la latitude au code IA.
-- Recommandations de valeurs : 'unknown_ean', 'new_product', 'low_confidence', 'quantity_mismatch'.
ALTER TABLE invoice_items
    ADD CONSTRAINT invoice_items_flag_coherent
    CHECK (NOT is_flagged OR flag_reason IS NOT NULL);

-- Index partiel pour les lignes flaggées (rapides à requêter dans l'UX validation)
CREATE INDEX IF NOT EXISTS idx_invoice_items_flagged
    ON invoice_items (invoice_id) WHERE is_flagged = true;

COMMENT ON COLUMN invoice_items.facture_qty IS 'Quantité que le fournisseur facture (telle que parsée par IA).';
COMMENT ON COLUMN invoice_items.received_qty IS 'Quantité que le marchand a confirmée à la validation. NULL tant que facture non validée. Peut différer de facture_qty (livraison partielle §7.5).';
COMMENT ON COLUMN invoice_items.is_flagged IS 'Flag IA pour attirer l''attention du marchand : EAN non reconnu, nouveau produit, etc.';
COMMENT ON COLUMN invoice_items.flag_reason IS 'Raison du flag. Valeurs recommandées : unknown_ean | new_product | low_confidence | quantity_mismatch.';
