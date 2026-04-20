-- 066_stock_status.sql
-- Status dispo/rupture par product (et donc par variante, puisqu'une variante = un product via variant_of).
-- Utilisé par le toggle rupture profils B/C. Pour profil A POS, sera synchronisé par code applicatif.

ALTER TABLE stock
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'out_of_stock')),
    ADD COLUMN IF NOT EXISTS last_toggled_at timestamptz;

-- Trigger : met à jour last_toggled_at quand status change (pas pour chaque UPDATE de quantity)
CREATE OR REPLACE FUNCTION update_stock_last_toggled()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.last_toggled_at = now();
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER stock_status_toggled
    BEFORE UPDATE ON stock
    FOR EACH ROW EXECUTE FUNCTION update_stock_last_toggled();

-- Index partial : les ruptures sont la minorité, c'est elles qu'on requête pour la clôture et le widget
CREATE INDEX IF NOT EXISTS idx_stock_out_of_stock
    ON stock (product_id) WHERE status = 'out_of_stock';

COMMENT ON COLUMN stock.status IS 'État manuel pour profils non-POS. available par défaut, out_of_stock via toggle. Pour profil POS, synchronisé par code applicatif depuis quantity.';
COMMENT ON COLUMN stock.last_toggled_at IS 'Timestamp du dernier changement de status. Utilisé pour streak clôture du soir et badge "Revenue en stock" (§9.4).';
