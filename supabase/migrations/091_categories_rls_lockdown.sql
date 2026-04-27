-- Migration 091 : lockdown RLS sur table `categories` (audit superficiel 2026-04-26)
--
-- Avant : `categories_auth_write` USING (true) WITH CHECK (true) → n'importe quel
-- utilisateur authentifié (consumer ou marchand) pouvait INSERT/UPDATE/DELETE
-- la taxonomie globale Two-Step. Risque concret : renommage malveillant d'une
-- branche, suppression de catégories, cassage du matching Tier 5 BERT.
--
-- Après : lecture publique conservée (`categories_public_read`), écriture
-- uniquement via service_role (admin scripts + migrations).
--
-- Si un jour on autorise l'admin à éditer la taxonomie via UI, on ajoutera
-- une policy spécifique gated sur `auth.app_metadata.role = 'admin'`.

DROP POLICY IF EXISTS "categories_auth_write" ON categories;

-- Pas de nouvelle policy = défaut deny pour authenticated/anon (RLS activé).
-- service_role bypass RLS donc les migrations + admin scripts continuent.

COMMENT ON TABLE categories IS
    'Taxonomie globale Two-Step. Lecture publique active uniquement. Écriture restreinte au service_role (admin scripts/migrations) depuis migration 091.';
