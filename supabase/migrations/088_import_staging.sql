-- Migration 088 : table de staging pour CSV/POS imports avant enrichissement
-- Cf. Phase 1 Task 1.2 — wizard admin onboarding step 1 (CSV upload)
-- Les rows ne sont visibles que via service_role (admin onboarding manuel).

CREATE TABLE IF NOT EXISTS import_staging (
    id BIGSERIAL PRIMARY KEY,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    raw_row JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'enriched', 'rejected', 'duplicate')),
    enriched_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_staging_merchant_status
    ON import_staging(merchant_id, status);

ALTER TABLE import_staging ENABLE ROW LEVEL SECURITY;

-- Pas de policy pour anon/authenticated → seule service_role peut accéder.
-- Ce comportement est volontaire : l'enrichissement est admin-only en V1.

COMMENT ON TABLE import_staging IS 'Staging temporaire avant enrichissement IA (admin onboarding wizard)';
COMMENT ON COLUMN import_staging.raw_row IS 'Ligne CSV brute (header→value) avant nettoyage';
COMMENT ON COLUMN import_staging.status IS 'pending → enriched (publié) / rejected (manuel) / duplicate';
