-- 100_enrichment_jobs_queue.sql  (APPLIQUÉE prod 2026-06-13)
-- File d'enrichissement asynchrone : découple l'enrichissement (lookups EAN,
-- cascade, image, catégorisation) de la requête d'ingestion HTTP, qui sinon
-- timeout dès ~100 nouveaux produits (enrichissement séquentiel 10-30 s/produit).
-- Calquée sur image_jobs (021/052) : claim atomique FOR UPDATE SKIP LOCKED,
-- compteur de tentatives, reset des jobs bloqués.

CREATE TABLE IF NOT EXISTS enrichment_jobs (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    status      text DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
    attempts    int DEFAULT 0,
    error       text,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now(),
    processed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_enrichment_jobs_active
    ON enrichment_jobs(product_id) WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_pending
    ON enrichment_jobs(status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_merchant
    ON enrichment_jobs(merchant_id);

ALTER TABLE enrichment_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS enrichment_jobs_select_own ON enrichment_jobs;
CREATE POLICY enrichment_jobs_select_own ON enrichment_jobs FOR SELECT
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION claim_enrichment_jobs(p_limit int DEFAULT 20)
RETURNS SETOF enrichment_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE enrichment_jobs
    SET status = 'processing', attempts = attempts + 1, updated_at = now()
    WHERE id IN (
        SELECT id FROM enrichment_jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION claim_enrichment_jobs(int) FROM public;
GRANT EXECUTE ON FUNCTION claim_enrichment_jobs(int) TO service_role;
