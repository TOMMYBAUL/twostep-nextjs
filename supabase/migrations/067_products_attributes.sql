-- 067_products_attributes.sql
-- Attributs jsonb libres par produit. Cohérent avec variant_of : une variante = un product,
-- ses attributs lui sont propres. Ex : { taille: "M", couleur: "bleu" } ou {} si taille unique.

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Index GIN pour queries de filtrage par attribut
-- (ex: WHERE attributes @> '{"taille": "M"}')
CREATE INDEX IF NOT EXISTS idx_products_attributes
    ON products USING gin (attributes);

COMMENT ON COLUMN products.attributes IS 'Attributs de variante libres : taille, couleur, capacité, etc. {} pour produits sans variantes.';
