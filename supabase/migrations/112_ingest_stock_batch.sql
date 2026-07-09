-- 112_ingest_stock_batch.sql  (ÉCRITE 2026-07-09 — NON APPLIQUÉE, fichier seulement)
--
-- Audit 2026-07-08, M4 CRITIQUE (feuille de route item #3) : le flux FILE_PUSH
-- (`ingestStockSnapshot` — import fichier/email/jeton) écrit le stock par UPSERT
-- DIRECT, en contournant la garde temporelle de la 104 (`update_stock_atomic` :
-- « un REPLACE plus ancien n'écrase pas une vérité plus fraîche »). Conséquence :
-- un export nocturne (généré 02:00) uploadé à 09:00 RÉÉCRIT par-dessus une vente
-- webhook de 08:00 → produit VENDU affiché « en stock » (faux positif n°1).
--
-- Router chaque ligne par `update_stock_atomic` ré-introduirait O(N) aller-retours
-- séquentiels (interdit : scale-ingest-batch, catalogues de MILLIERS de SKU). Cette
-- RPC applique donc LA MÊME garde temporelle EN SET (1 appel par lot de 500) :
--   INSERT … ON CONFLICT DO UPDATE … WHERE EXCLUDED.source_ts >= stock.source_ts
-- (même sens que la 104 : rejet si strictement plus ancien). Elle retourne, PAR
-- LIGNE, `written` (l'écriture a eu lieu) ou false (rejet stale) → le caller compte
-- les rejets (`stock_stale_skipped`, jamais silencieux — enjeu n°1).
--
-- Le caller (src/lib/ingest/snapshot.ts) n'appelle cette RPC QUE derrière le flag
-- `FILE_PUSH_ATOMIC_STOCK=1` (OFF par défaut) → appliquer cette migration PUIS
-- poser le flag (décision #13). Flag ON sans migration = repli upsert direct
-- signalé Sentry (aucune perte, garde inactive).
--
-- Notes de sûreté :
--  - Dédup par product_id DANS la RPC (la plus fraîche gagne) : ON CONFLICT ne peut
--    pas affecter deux fois la même ligne (le caller dédup déjà ; défensif). En cas
--    d'égalité EXACTE de source_ts entre deux lignes du même produit, le choix est
--    arbitraire (LOW assumé : le caller dédup en amont, dernier-gagne).
--  - VALIDATION DE FORMAT AVANT CAST (revue database-reviewer, HIGH) : un cast nu
--    (`::uuid`, `::int`, `::timestamptz`) sur une valeur malformée lèverait une
--    exception qui AVORTE TOUT le lot de 500 (l'INSERT+CTE est UNE requête) → une
--    seule ligne toxique tuerait 499 saines. Les lignes au format invalide sont
--    FILTRÉES (même traitement que NULL) → absentes du retour → le caller les
--    signale (« lignes non confirmées »), jamais un drop muet ni un lot empoisonné.
--    `quantity` décimal accepté et ARRONDI (::numeric::int) ; `source_ts` illisible
--    → now() ; `source` hors CHECK 104 → 'file_push' (seul writer réel de ce chemin).
--  - `source_ts` borné à now() (LEAST) : une horloge source dans le futur ne peut
--    pas poser une vérité qui bloquerait toutes les écritures suivantes.
--  - `ORDER BY pid` avant l'INSERT (revue database-reviewer, MED) : ordre de
--    verrouillage DÉTERMINISTE entre deux lots concurrents à produits chevauchants
--    (défense-en-profondeur anti-deadlock, pas seulement l'effet de bord du planner).
--  - SECURITY DEFINER + REVOKE anon/authenticated (LESSON : CREATE réinitialise
--    l'ACL à PUBLIC ; parité 092/110). service_role bypasse les GRANT.
--    ⚠️ Thomas : vérifier les grants réels en prod (get_advisors) avant d'appliquer.
--
-- IDEMPOTENTE : DROP IF EXISTS + CREATE, ré-exécutable.
-- TRANSACTION-WRAPPÉE ; `lock_timeout` court (objet neuf : aucun caller existant,
-- mais un re-run sur fonction chaude ne doit jamais jammer la file — classe 097).
--
-- DOWN (rollback) :
--   DROP FUNCTION IF EXISTS public.ingest_stock_batch(jsonb);
--   (objet nouveau, aucun prédécesseur ; le code applicatif retombe sur l'upsert
--   direct via le repli Sentry, ou remettre FILE_PUSH_ATOMIC_STOCK=0.)

BEGIN;

SET LOCAL lock_timeout = '3s';

DROP FUNCTION IF EXISTS public.ingest_stock_batch(jsonb);

CREATE FUNCTION public.ingest_stock_batch(p_rows jsonb)
RETURNS TABLE(product_id uuid, written boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH input AS (
        -- Dédup défensive : une seule ligne par produit, la vérité la plus fraîche gagne.
        SELECT DISTINCT ON (x.pid) x.pid, x.qty, x.src, x.sts
        FROM (
            SELECT (r->>'product_id')::uuid                              AS pid,
                   -- Décimal accepté (arrondi), jamais de cast qui avorte le lot.
                   GREATEST(0, ((r->>'quantity')::numeric)::int)         AS qty,
                   -- Hors CHECK 104 → 'file_push' (seul writer réel de ce chemin).
                   CASE WHEN r->>'source' IN ('webhook','pos_sync','file_push','scan','invoice','cloture','manual')
                        THEN r->>'source' ELSE 'file_push' END           AS src,
                   -- source_ts illisible → now() ; borné à now() (horloge future).
                   LEAST(
                       CASE WHEN (r->>'source_ts') ~ '^\d{4}-\d{2}-\d{2}'
                            THEN (r->>'source_ts')::timestamptz ELSE now() END,
                       now()
                   ) AS sts
            FROM jsonb_array_elements(p_rows) AS r
            -- Format validé AVANT cast : ligne malformée = FILTRÉE (absente du retour
            -- → signalée par le caller), jamais une exception qui tue le lot entier.
            WHERE (r->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND (r->>'quantity')   ~  '^-?[0-9]+(\.[0-9]+)?$'
        ) x
        ORDER BY x.pid, x.sts DESC
    ),
    upserted AS (
        INSERT INTO stock AS s (product_id, quantity, source, source_ts)
        -- ORDER BY pid : ordre de verrouillage déterministe (anti-deadlock).
        SELECT i.pid, i.qty, i.src, i.sts FROM input i ORDER BY i.pid
        ON CONFLICT (product_id) DO UPDATE
            SET quantity   = EXCLUDED.quantity,
                updated_at = now(),
                source     = EXCLUDED.source,
                source_ts  = EXCLUDED.source_ts
            -- Garde temporelle 104, en set : jamais écraser une vérité plus fraîche.
            WHERE EXCLUDED.source_ts >= s.source_ts
        RETURNING s.product_id AS pid
    )
    SELECT i.pid, (u.pid IS NOT NULL)
    FROM input i
    LEFT JOIN upserted u ON u.pid = i.pid;
END;
$$;

-- RPC admin-only : jamais appelable par anon/authenticated (elle écrit le stock
-- sans RLS). Les appelants applicatifs passent tous par le client service_role.
REVOKE EXECUTE ON FUNCTION public.ingest_stock_batch(jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;

-- Vérification post-migration (à jouer après application) :
--   SELECT * FROM ingest_stock_batch('[]'::jsonb);                    -- attendu : 0 ligne
--   SELECT * FROM ingest_stock_batch(jsonb_build_array(jsonb_build_object(
--       'product_id', '<uuid produit test>', 'quantity', 3,
--       'source', 'file_push', 'source_ts', '2000-01-02T00:00:00Z')));
--   -- attendu : (uuid, false) si la ligne stock existante est plus fraîche que 2000.
