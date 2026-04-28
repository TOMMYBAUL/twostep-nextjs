-- Migration 089 : score d'identification cascade (Phase A2)
-- Cf. brain `06-Tech/Socle-identification-cascade.md` — gates UX :
--   ≥ 0.95 → AUTO-CLEAN visible (review_status='validated')
--   0.70-0.95 → QUEUE VALIDATION 1-tap marchand (review_status='pending')
--   < 0.70 → MASQUÉ public (review_status='masked', visible dashboard marchand seul)

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS identification_score NUMERIC(4,3)
        CHECK (identification_score IS NULL OR (identification_score >= 0 AND identification_score <= 1)),
    ADD COLUMN IF NOT EXISTS identification_tiers TEXT[];

CREATE INDEX IF NOT EXISTS idx_products_identification_score
    ON products(identification_score)
    WHERE identification_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_identification_tiers
    ON products USING GIN(identification_tiers)
    WHERE identification_tiers IS NOT NULL;

COMMENT ON COLUMN products.identification_score IS
    'Score [0,1] de la cascade Tier 1-6. ≥0.95 = visible, 0.70-0.95 = queue review, <0.70 = masked';
COMMENT ON COLUMN products.identification_tiers IS
    'Liste des tiers matchés (ex: tier1_isbn, tier2_off, tier3_google_pc, tier4_clip, tier6_eansearch)';
