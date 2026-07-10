-- 113_merchant_sla_history.sql  (NON APPLIQUÉE — gated, GO Thomas requis, groupable décision #3)
--
-- G1 (audit 07-04, Cluster G « valeur produit type NearSt ») : historique QUOTIDIEN du SLA
-- fraîcheur/publiabilité par marchand — l'écran qu'on montre au pilote (Deerskin) pour
-- justifier l'abonnement (« X % de ton stock est publiable et frais, et voilà la courbe 7 j »).
--
-- Écrit par le cron `quality-check` (05:00, service-role) UNIQUEMENT si le flag Vercel
-- MERCHANT_SLA_HISTORY=1 est posé (sans la migration ET le flag, aucun write tenté — chemin
-- d'insert SÉPARÉ des alertes, anti batch-poisoning, cf. LESSONS 081/089/107). Calcul =
-- helper pur `computeMerchantSlaSnapshots` (src/lib/monitoring/merchant-sla.ts) : parité
-- STRICTE avec le gate feed (`isFeedEligible`) et la confiance conso (`computeStockConfidence`).
-- Lu par GET /api/google/sla-history (RLS : le marchand ne voit que SON historique).
--
-- 1 ligne par (marchand, jour) — le cron upsert (onConflict merchant_id,day) : un re-run
-- manuel du même jour REMPLACE la ligne (dernier état du jour), jamais de doublon.
--
-- ⚠️ Protocole migration §4 : à jouer d'abord sur une branche Supabase de test, puis en prod
--    sur GO Thomas. Idempotente + transaction-wrappée.
--
-- Rollback :
--   DROP TABLE IF EXISTS public.merchant_sla_history;

BEGIN;

CREATE TABLE IF NOT EXISTS public.merchant_sla_history (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    -- Jour UTC du snapshot (le cron tourne à 05:00 UTC ; 1 ligne/jour/marchand).
    day date NOT NULL,
    -- Population feed du marchand (visible + validated + non archivé + non variante).
    total integer NOT NULL,
    -- Passe le VRAI gate feed (isFeedEligible) = publiable sur Google.
    publishable integer NOT NULL,
    -- % publiable (= PublishabilitySummary.score).
    publishable_score integer NOT NULL,
    -- Quantité > 0 dans la population.
    in_stock integer NOT NULL,
    -- Publiable ET en stock = offres réellement montrables.
    publishable_in_stock integer NOT NULL,
    -- Confiance stock « available » (affiché « Disponible ») parmi publishable_in_stock.
    fresh_available integer NOT NULL,
    -- % fresh_available / publishable_in_stock (0 si dénominateur 0).
    freshness_score integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_merchant_sla_history_merchant_day UNIQUE (merchant_id, day)
);

-- Lecture dashboard (.eq(merchant_id).order(day desc).limit(30)) : servie par l'index
-- IMPLICITE de la contrainte UNIQUE (merchant_id, day) en Index Scan Backward — pas de
-- second index (revue database-reviewer : redondant = double coût d'écriture pour rien).

ALTER TABLE public.merchant_sla_history ENABLE ROW LEVEL SECURITY;

-- Le marchand lit SON historique ; personne d'autre. Écriture = service-role uniquement
-- (bypass RLS) : aucune policy INSERT/UPDATE/DELETE pour authenticated/anon.
DROP POLICY IF EXISTS "merchant reads own sla history" ON public.merchant_sla_history;
CREATE POLICY "merchant reads own sla history" ON public.merchant_sla_history
    FOR SELECT TO authenticated
    USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = (SELECT auth.uid())));

REVOKE ALL ON public.merchant_sla_history FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.merchant_sla_history FROM authenticated;

COMMIT;
