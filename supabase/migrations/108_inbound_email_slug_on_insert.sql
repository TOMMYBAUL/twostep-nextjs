-- 108_inbound_email_slug_on_insert.sql
-- P0-2 : tout marchand créé APRÈS la 057 avait inbound_email_slug = NULL pour
-- toujours (le trigger 012 ne pose que `slug` ; la 057 n'était qu'un backfill
-- one-shot) → aucune adresse email-in (factures-{slug}@… / stock-{slug}@…).
--
-- (a) Trigger d'insert : pose inbound_email_slug quand NULL.
-- (b) Backfill : répare les marchands créés entre la 057 et cette migration.
--
-- FORMAT (identique 057) : inbound_email_slug = merchants.slug (sans préfixe ;
-- les préfixes stock-/factures- appartiennent à l'ADRESSE, construite par
-- /api/email/inbound-address et parsée par parseInboundAddress).
--
-- ⚠️ On N'ÉTEND PAS set_slug_on_insert (012) : cette fonction est partagée avec
-- le trigger de `products`, table qui n'a PAS de colonne inbound_email_slug —
-- l'étendre casserait tous les inserts produits. Fonction dédiée merchants.
--
-- ⚠️ Ordre des triggers BEFORE INSERT : PostgreSQL les exécute par ordre
-- ALPHABÉTIQUE de nom → merchants_inbound_email_slug_trigger tire AVANT
-- merchants_slug_trigger (i < s), donc NEW.slug peut encore être NULL ici.
-- On applique la MÊME formule que set_slug_on_insert (012) : le résultat est
-- identique à `slug` par construction (et si l'application fournit déjà un
-- slug explicite, on le réutilise). `slug` est UNIQUE (012) → la contrainte
-- merchants_inbound_email_slug_unique (057) est respectée par construction.
--
-- Idempotente : CREATE OR REPLACE + backfill borné aux lignes NULL.
-- Réversible (down) :
--   DROP TRIGGER IF EXISTS merchants_inbound_email_slug_trigger ON merchants;
--   DROP FUNCTION IF EXISTS set_inbound_email_slug_on_insert();
--   (le backfill est non destructif : il ne pose des valeurs que là où il n'y
--    en avait pas ; aucune valeur existante n'est modifiée.)

CREATE OR REPLACE FUNCTION set_inbound_email_slug_on_insert() RETURNS trigger AS $$
BEGIN
    IF NEW.inbound_email_slug IS NULL OR NEW.inbound_email_slug = '' THEN
        NEW.inbound_email_slug := COALESCE(
            NULLIF(NEW.slug, ''),
            generate_slug(NEW.name) || '-' || left(NEW.id::text, 8)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER merchants_inbound_email_slug_trigger
    BEFORE INSERT ON merchants
    FOR EACH ROW EXECUTE FUNCTION set_inbound_email_slug_on_insert();

-- Backfill des marchands créés entre la 057 et cette migration (NULL only —
-- ne touche jamais une adresse déjà posée, donc déjà communiquée).
UPDATE merchants
SET inbound_email_slug = slug
WHERE inbound_email_slug IS NULL
  AND slug IS NOT NULL;
