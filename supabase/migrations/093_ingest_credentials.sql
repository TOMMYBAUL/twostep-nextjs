-- 093_ingest_credentials.sql
-- Workflow d'ingestion "à la NearSt" : push de fichier stock récurrent, sans session,
-- authentifié par un jeton unique par marchand. Permet à N'IMPORTE QUELLE caisse
-- (même les caisses françaises à API fermée) de pousser un export planifié
-- {code-barres ; quantité ; prix} par HTTP, sans intégration API propriétaire.
--
-- Le jeton est un SECRET : on ne le met PAS sur merchants (dont le SELECT est public,
-- cf. audit §8 / faille S3). Table dédiée avec RLS owner-only.

CREATE TABLE IF NOT EXISTS ingest_credentials (
    merchant_id  uuid PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
    token        text NOT NULL UNIQUE,          -- généré côté app (crypto.randomBytes(24).hex = 192 bits)
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz,                    -- fraîcheur du dernier push (badge "vu il y a X min")
    last_rows    integer,                        -- nb de lignes du dernier push
    last_status  text                            -- 'ok' | 'partial' | 'error'
);

CREATE INDEX IF NOT EXISTS idx_ingest_credentials_token ON ingest_credentials(token);

ALTER TABLE ingest_credentials ENABLE ROW LEVEL SECURITY;

-- Le marchand lit/gère son propre jeton (pour l'afficher / le régénérer dans le dashboard).
-- service_role (endpoint d'ingestion) bypass la RLS pour résoudre token -> merchant.
DROP POLICY IF EXISTS ingest_cred_owner ON ingest_credentials;
CREATE POLICY ingest_cred_owner ON ingest_credentials
    FOR ALL TO authenticated
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()))
    WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

COMMENT ON TABLE ingest_credentials IS 'Jeton de push stock par marchand (workflow NearSt). Secret — jamais sur merchants (SELECT public).';
