-- 110_stock_written_flag.sql  (ÉCRITE 2026-07-06 — NON APPLIQUÉE, fichier seulement)
--
-- P0-6 : `update_stock_atomic` renvoyait `v_previous` (int) INDISTINCTEMENT que l'écriture
-- ait EU LIEU ou non — deux cas où le stock ne change PAS :
--   (a) REPLACE absolu périmé rejeté par la garde temporelle 104 (`p_source_ts < v_prev_ts`
--       → RETURN v_previous SANS UPDATE) ;
--   (b) écriture committée mais quantité INCHANGÉE (retry du même événement absolu, delta
--       clampé à 0, etc.).
-- Les 4 routes webhook + /api/stock déduisent un `feed_events` (sale/restock) et une PUSH
-- « De retour en stock ! » à partir du seul `previousQty`. Sur le cas (a) : un webhook absolu
-- livré DANS LE DÉSORDRE (DB fraîche = 0/épuisé, événement PÉRIMÉ = 5) est rejeté par la garde,
-- mais la route voyait `previousQty=0` + `quantity=5>0` → émettait un `restock` MENSONGER ET
-- NOTIFIAIT les favoris « de retour en stock » sur un produit RÉELLEMENT épuisé (anti north-star :
-- affichage honnête + spam consommateur). Sur le cas (b) : Zettle (feed_event INCONDITIONNEL)
-- ré-émettait un « sale » fantôme à chaque retry.
--
-- Fix : le contrat de sortie devient (previous int, written boolean) — `written` = le stock a
-- RÉELLEMENT changé (ni rejet temporel, ni no-op). Les appelants n'émettent l'effet de bord
-- (feed_event / notification) QUE si `written`. La quantité `previous` reste disponible pour
-- l'arithmétique (`/api/stock` calcule newQty = previous + delta).
--
-- CETTE MIGRATION SUBSUME LA 109 (P0-5) : elle intègre déjà le `GREATEST(v_prev_ts, p_source_ts)`
-- du mode delta. Appliquer la 110 seule suffit (109 devient redondante). Si la 109 a déjà été
-- appliquée, la 110 la remplace sans risque (DROP+CREATE, la 109 n'ajoute pas de colonne).
--
-- ⚠️ CHANGEMENT DE TYPE DE RETOUR (int → TABLE) : impose DROP FUNCTION avant CREATE
-- (CREATE OR REPLACE ne peut pas changer le type de retour). Signature d'ARGUMENTS INCHANGÉE
-- (5 args, mêmes noms/types/DEFAULT) → aucun overload ambigu PGRST203, aucun appel PostgREST
-- nommé cassé côté arguments. Le SEUL consommateur du RÉSULTAT est le wrapper
-- `updateStockAtomic` (src/lib/pos/update-stock.ts), qui tolère l'ANCIENNE forme scalaire ET
-- la nouvelle forme (previous, written) → **déploiement du code sûr AVANT l'application de
-- cette migration** (pré-110, `written` par défaut = true = comportement actuel EXACT).
--
-- IDEMPOTENTE : DROP IF EXISTS + CREATE, ré-exécutable.
-- TRANSACTION-WRAPPÉE : DDL atomique (pas de fenêtre « fonction absente » pour les sessions
-- concurrentes — elles attendent le COMMIT puis voient la nouvelle version).
--
-- ⚠️ LOCKING À L'APPLICATION (revue database-reviewer, HIGH) : `DROP FUNCTION` demande un verrou
-- exclusif sur l'objet fonction et se met en file DERRIÈRE tout appel `update_stock_atomic` EN
-- COURS ; une fois en file, TOUT nouvel appel (webhooks, /api/stock) se met en file derrière le
-- DROP jusqu'au COMMIT → pile-up possible si un appelant est bloqué (FOR UPDATE sur un product_id
-- chaud, webhook lent). `SET LOCAL lock_timeout = '3s'` fait ÉCHOUER VITE la migration (retry
-- possible) plutôt que de jammer la file (classe de l'incident 097). Appliquer en heure creuse,
-- vérifier `pg_stat_activity`/`pg_locks` juste avant.
--
-- 🔒 PRIVILÈGE (revue database-reviewer, CRITIQUE) : la 092 avait révoqué EXECUTE de anon/
-- authenticated sur l'ANCIENNE signature 3-args ; la recréation 5-args de la 104 est un objet
-- DISTINCT → ACL par défaut = PUBLIC (donc anon/authenticated peuvent appeler la RPC admin
-- `update_stock_atomic` directement). Ce DROP+CREATE réinitialise l'ACL à PUBLIC → on RÉ-APPLIQUE
-- le REVOKE ici (ferme aussi le trou pré-existant sur la 5-args). service_role garde l'accès
-- (bypass des GRANT). ⚠️ Thomas : vérifier les grants réels en prod (get_advisors) avant d'appliquer.
--
-- DOWN (rollback) : ré-appliquer la 104 (RETURNS int) — voir 104_stock_source_tracking.sql :
--   DROP FUNCTION IF EXISTS update_stock_atomic(uuid, int, text, text, timestamptz);
--   puis recréer le corps de la 104 (RETURNS int, RETURN v_previous) + RÉ-APPLIQUER le REVOKE
--   EXECUTE ci-dessous. ⚠️ CONTRAINTE DURE : NE PAS appliquer la 109 seule puis rollback vers
--   « le corps 104 » — le corps 104 n'a PAS le GREATEST(source_ts) de la 109 → réintroduirait le
--   bug P0-5. La 110 SUBSUME la 109 : appliquer la 110 directement (sauter la 109).

BEGIN;

-- Échec rapide si un appel en cours retient le verrou → ne jamais jammer la file de la RPC stock.
SET LOCAL lock_timeout = '3s';

-- Retire la version RETURNS int (104/109) avant de recréer avec un type de retour composite.
DROP FUNCTION IF EXISTS update_stock_atomic(uuid, int, text, text, timestamptz);

CREATE FUNCTION update_stock_atomic(
    p_product_id uuid,
    p_quantity int,
    p_mode text DEFAULT 'absolute',
    p_source text DEFAULT 'manual',
    p_source_ts timestamptz DEFAULT now()
)
RETURNS TABLE(previous int, written boolean)
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
        -- Première ligne de stock : c'est une écriture réelle (previous conceptuel = 0).
        RETURN QUERY SELECT 0, true;
        RETURN;
    END IF;

    IF p_mode = 'delta' THEN
        v_new := GREATEST(0, v_previous + p_quantity);
        -- P0-5 (subsumée) : un delta RETARDÉ (p_source_ts ancien) ne fait plus reculer la
        -- fraîcheur observée — sinon un REPLACE périmé ultérieur passerait la garde absolue.
        v_source_ts := GREATEST(v_prev_ts, p_source_ts);
    ELSE
        -- REPLACE absolu : on n'écrase PAS avec une vérité plus ANCIENNE.
        IF p_source_ts < v_prev_ts THEN
            -- Rejet temporel : AUCUNE écriture → written=false (P0-6). L'appelant n'émet
            -- ni feed_event ni notification (le stock reste la vérité fraîche existante).
            RETURN QUERY SELECT v_previous, false;
            RETURN;
        END IF;
        v_new := GREATEST(0, p_quantity);
        v_source_ts := p_source_ts;
    END IF;

    UPDATE stock
    SET quantity = v_new, updated_at = now(), source = p_source, source_ts = v_source_ts
    WHERE product_id = p_product_id;

    -- written = le stock a RÉELLEMENT changé. Un no-op (retry du même absolu, delta clampé)
    -- ne doit pas émettre de sale/restock fantôme.
    RETURN QUERY SELECT v_previous, (v_new IS DISTINCT FROM v_previous);
    RETURN;
END;
$$;

-- RPC admin-only : le DROP+CREATE a réinitialisé l'ACL à PUBLIC → re-révoquer anon/authenticated
-- (parité avec 092 ; ferme le trou pré-existant sur la signature 5-args). service_role conserve
-- l'accès (bypass des GRANT) ; les appelants applicatifs passent tous par le client admin.
REVOKE EXECUTE ON FUNCTION public.update_stock_atomic(uuid, int, text, text, timestamptz) FROM anon, authenticated;

COMMIT;

-- Vérification post-migration (à jouer après application) :
--   SELECT * FROM update_stock_atomic('<uuid produit test>'::uuid, 0, 'delta', 'manual');
--   -- attendu : une ligne (previous, written) ; written=false si delta 0 (no-op).
