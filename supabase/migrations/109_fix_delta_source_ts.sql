-- 109_fix_delta_source_ts.sql  (ÉCRITE 2026-07-04 — NON APPLIQUÉE, fichier seulement)
-- P0-5 : en mode 'delta', l'UPDATE de la 104 écrivait `source_ts = p_source_ts`
-- INCONDITIONNELLEMENT. Un delta webhook livré EN RETARD (retry/outage → p_source_ts
-- ANCIEN) faisait donc RECULER stock.source_ts — ce qui neutralisait la garde
-- temporelle du mode absolu (104, `IF p_source_ts < v_prev_ts THEN RETURN`) : un
-- REPLACE périmé, comparé à ce source_ts reculé, redevenait « plus frais » que la
-- base et écrasait une vérité plus récente (faux stock silencieux, enjeu n°1).
--
-- Fix : en mode delta, `source_ts = GREATEST(v_prev_ts, p_source_ts)` — le delta
-- s'applique TOUJOURS (le décrément de la vente est réel, ordre indifférent), mais
-- la fraîcheur observée ne recule jamais. Modes absolute/INSERT inchangés.
--
-- SIGNATURE IDENTIQUE à la 104 : 5 args mêmes noms/types/DEFAULT, RETURNS int
-- (les appelants PostgREST — updateStockAtomic à 4 ou 5 params nommés — et le
-- contrat `v_previous` en dépendent) → CREATE OR REPLACE sûr, aucun risque
-- d'overload ambigu PGRST203 (leçon 104 : ne PAS changer le nombre de params).
-- IDEMPOTENTE : CREATE OR REPLACE, ré-exécutable sans effet supplémentaire.
--
-- DOWN (rollback) : ré-appliquer le corps de la 104, c.-à-d. dans la branche delta
-- supprimer `v_source_ts := GREATEST(v_prev_ts, p_source_ts)` et remettre
-- `source_ts = p_source_ts` dans l'UPDATE — voir 104_stock_source_tracking.sql
-- (lignes 19-62) pour le corps exact.

CREATE OR REPLACE FUNCTION update_stock_atomic(
    p_product_id uuid,
    p_quantity int,
    p_mode text DEFAULT 'absolute',
    p_source text DEFAULT 'manual',
    p_source_ts timestamptz DEFAULT now()
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_previous int;
    v_prev_ts  timestamptz;
    v_new int;
    v_source_ts timestamptz;
BEGIN
    SELECT quantity, source_ts INTO v_previous, v_prev_ts
    FROM stock WHERE product_id = p_product_id FOR UPDATE;

    IF NOT FOUND THEN
        v_new := GREATEST(0, p_quantity);
        INSERT INTO stock (product_id, quantity, source, source_ts)
        VALUES (p_product_id, v_new, p_source, p_source_ts);
        RETURN 0;
    END IF;

    IF p_mode = 'delta' THEN
        v_new := GREATEST(0, v_previous + p_quantity);
        -- P0-5 : le delta s'applique, mais un delta RETARDÉ (p_source_ts ancien)
        -- ne fait plus reculer la fraîcheur observée — sinon un REPLACE périmé
        -- ultérieur passerait la garde absolue et écraserait la vérité fraîche.
        v_source_ts := GREATEST(v_prev_ts, p_source_ts);
    ELSE
        -- REPLACE absolu : on n'écrase PAS avec une vérité plus ANCIENNE.
        IF p_source_ts < v_prev_ts THEN
            RETURN v_previous;
        END IF;
        v_new := GREATEST(0, p_quantity);
        v_source_ts := p_source_ts;
    END IF;

    UPDATE stock
    SET quantity = v_new, updated_at = now(), source = p_source, source_ts = v_source_ts
    WHERE product_id = p_product_id;

    RETURN v_previous;
END;
$$;
