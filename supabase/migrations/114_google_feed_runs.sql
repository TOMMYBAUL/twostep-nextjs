-- 114_google_feed_runs.sql  (NON APPLIQUÉE — gated, GO Thomas requis, groupable décision #3)
--
-- G2 (audit 07-04, Cluster G « valeur produit type NearSt ») : historique de QUALITÉ du feed
-- Google par marchand — le feed-quality report type NearSt. Le cron `google-status` (06:00)
-- relit `accounts/{account}/products` et calcule déjà served/pending/disapproved + causes ;
-- jusqu'ici ce résumé était JETÉ dans la réponse HTTP du cron (que personne ne lit). Cette
-- table le persiste pour l'écran marchand (« vos offres sur Google : X servies, Y refusées,
-- et voici pourquoi » + courbe).
--
-- Écrit par le cron `google-status` (service-role) UNIQUEMENT si le flag Vercel
-- GOOGLE_FEED_RUNS_HISTORY=1 est posé (sans la migration ET le flag, aucun write tenté).
-- Projection = helper pur `buildFeedRunRow` (src/lib/google/product-status.ts) : mêmes
-- compteurs que le signal Sentry du cron, jamais une 2ᵉ logique.
-- Lu par GET /api/google/feed-runs (RLS : le marchand ne voit que SON historique).
--
-- 1 ligne par (marchand, jour) — le cron upsert (onConflict merchant_id,day) : un re-run
-- manuel du même jour REMPLACE la ligne (dernier read-back du jour), jamais de doublon.
-- `top_issues` = top-10 des causes (code/severity/description/count), borné côté code.
--
-- ⚠️ Protocole migration §4 : à jouer d'abord sur une branche Supabase de test, puis en prod
--    sur GO Thomas. Idempotente + transaction-wrappée.
--
-- Rollback :
--   DROP TABLE IF EXISTS public.google_feed_runs;

BEGIN;

CREATE TABLE IF NOT EXISTS public.google_feed_runs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    -- Jour UTC du run (le cron tourne à 06:00 UTC ; 1 ligne/jour/marchand).
    day date NOT NULL,
    -- Horodatage exact du dernier run du jour (re-run manuel → remplacé).
    run_at timestamptz NOT NULL,
    -- Compteurs du read-back Google (classifyProductStatus) : total = served + pending
    -- + disapproved + unknown (unknown = produit pas encore traité par Google).
    total integer NOT NULL,
    served integer NOT NULL,
    pending integer NOT NULL,
    disapproved integer NOT NULL,
    unknown integer NOT NULL,
    -- Top-10 causes agrégées (itemLevelIssues) : [{code, severity, description, count}].
    top_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_google_feed_runs_merchant_day UNIQUE (merchant_id, day),
    -- Trip-wires fail-loud (revue database-reviewer) : si le helper `buildFeedRunRow`
    -- dérive un jour (compteur oublié, top_issues débordé), l'upsert ÉCHOUE (capturé
    -- Sentry step feed-run-write) au lieu de persister un historique incohérent.
    CONSTRAINT ck_google_feed_runs_total CHECK (total = served + pending + disapproved + unknown),
    CONSTRAINT ck_google_feed_runs_top_issues_bounded CHECK (jsonb_array_length(top_issues) <= 10)
);

-- Lecture dashboard (.eq(merchant_id).order(day desc).limit(30)) : servie par l'index
-- IMPLICITE de la contrainte UNIQUE (merchant_id, day) en Index Scan Backward — pas de
-- second index (même verdict database-reviewer que 113 : redondant = double coût d'écriture).

ALTER TABLE public.google_feed_runs ENABLE ROW LEVEL SECURITY;

-- Le marchand lit SON historique ; personne d'autre. Écriture = service-role uniquement
-- (bypass RLS) : aucune policy INSERT/UPDATE/DELETE pour authenticated/anon.
DROP POLICY IF EXISTS "merchant reads own feed runs" ON public.google_feed_runs;
CREATE POLICY "merchant reads own feed runs" ON public.google_feed_runs
    FOR SELECT TO authenticated
    USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = (SELECT auth.uid())));

REVOKE ALL ON public.google_feed_runs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.google_feed_runs FROM authenticated;

COMMIT;
