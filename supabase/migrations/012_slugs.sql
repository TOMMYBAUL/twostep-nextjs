-- Add slug columns
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS slug text;

-- Generate slugs from names (lowercase, accents stripped, spaces → hyphens)
-- PostgreSQL function to slugify
CREATE OR REPLACE FUNCTION generate_slug(input text) RETURNS text AS $$
BEGIN
    RETURN lower(
        regexp_replace(
            regexp_replace(
                translate(
                    input,
                    'àáâãäåèéêëìíîïòóôõöùúûüýÿñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝŸÑÇ',
                    'aaaaaaeeeeiiiioooooouuuuyyncAAAAAAEEEEIIIIOOOOOUUUUYYNC'
                ),
                '[^a-zA-Z0-9\s-]', '', 'g'
            ),
            '\s+', '-', 'g'
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Populate slugs for merchants (append first 8 chars of id for uniqueness)
UPDATE merchants SET slug = generate_slug(name) || '-' || left(id::text, 8) WHERE slug IS NULL;

-- Populate slugs for products (append first 8 chars of id for uniqueness)
UPDATE products SET slug = generate_slug(name) || '-' || left(id::text, 8) WHERE slug IS NULL;

-- Make slug NOT NULL with default
ALTER TABLE merchants ALTER COLUMN slug SET NOT NULL;
ALTER TABLE products ALTER COLUMN slug SET NOT NULL;

-- Unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS merchants_slug_idx ON merchants (slug);
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_idx ON products (slug);

-- Auto-generate slug on insert via trigger
CREATE OR REPLACE FUNCTION set_slug_on_insert() RETURNS trigger AS $$
BEGIN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
        NEW.slug := generate_slug(NEW.name) || '-' || left(NEW.id::text, 8);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER merchants_slug_trigger
    BEFORE INSERT ON merchants
    FOR EACH ROW EXECUTE FUNCTION set_slug_on_insert();

CREATE OR REPLACE TRIGGER products_slug_trigger
    BEFORE INSERT ON products
    FOR EACH ROW EXECUTE FUNCTION set_slug_on_insert();
