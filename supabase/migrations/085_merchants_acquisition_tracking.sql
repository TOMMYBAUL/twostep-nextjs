-- supabase/migrations/085_merchants_acquisition_tracking.sql
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS acquisition_channel TEXT,
  ADD COLUMN IF NOT EXISTS cost_estimate_eur NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_merchants_signed_at ON merchants(signed_at);

COMMENT ON COLUMN merchants.acquisition_channel IS 'terrain | apporteur | inbound | referral | autre';
COMMENT ON COLUMN merchants.cost_estimate_eur IS 'Coût d''acquisition estimé en EUR (temps Thomas + frais terrain)';
COMMENT ON COLUMN merchants.first_contact_at IS 'Premier contact prospect (entry funnel)';
COMMENT ON COLUMN merchants.signed_at IS 'Signature contrat / 1ère facture (acquisition complète)';
