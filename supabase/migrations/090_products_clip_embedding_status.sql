-- Migration 090 : tracking état embeddings CLIP par produit (Cycle 8 — Tier 4 cascade)
-- Cf. docs/cascade/CLIP-V1-DESIGN.md
--
-- Le vector lui-même N'EST PAS stocké en DB (single source of truth = Cloudflare Vectorize).
-- Cette migration ajoute juste l'état (pending / embedded / failed / skipped) + la version
-- du modèle utilisé pour traçabilité et re-embed possible quand on switche FashionCLIP.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clip_embedding_status') THEN
        CREATE TYPE clip_embedding_status AS ENUM (
            'pending',   -- photo OK, embedding pas encore lancé
            'embedded',  -- vector pushé dans Vectorize, queryable
            'failed',    -- erreur Replicate ou Vectorize, à retry
            'skipped'    -- produit sans photo OU photo non-publique (Drive privé) → CLIP impossible
        );
    END IF;
END $$;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS clip_embedding_status clip_embedding_status DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS clip_embedding_model TEXT,
    ADD COLUMN IF NOT EXISTS clip_embedded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS clip_embedding_error TEXT;

-- Index partiel sur les produits qui ont besoin d'être embeddés (queue de fond)
CREATE INDEX IF NOT EXISTS idx_products_clip_pending
    ON products(merchant_id, clip_embedding_status)
    WHERE clip_embedding_status IN ('pending', 'failed');

COMMENT ON COLUMN products.clip_embedding_status IS
    'État du Tier 4 cascade : pending (photo OK, embedding TODO), embedded (vector dans Vectorize), failed (retry), skipped (pas de photo)';
COMMENT ON COLUMN products.clip_embedding_model IS
    'Versioning : permet re-embed quand on switche modèle (ex CLIP-features → FashionCLIP)';
COMMENT ON COLUMN products.clip_embedded_at IS
    'Timestamp dernier embed réussi pour staleness check';
