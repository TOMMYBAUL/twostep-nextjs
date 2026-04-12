-- 057_inbound_email_slug.sql
-- Adresse email dédiée par marchand pour réception automatique de factures
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS inbound_email_slug text;

-- Générer le slug pour les marchands existants (basé sur leur slug existant)
UPDATE merchants SET inbound_email_slug = slug WHERE inbound_email_slug IS NULL AND slug IS NOT NULL;

-- Contrainte d'unicité (après population pour éviter les conflits)
ALTER TABLE merchants ADD CONSTRAINT merchants_inbound_email_slug_unique UNIQUE (inbound_email_slug);
