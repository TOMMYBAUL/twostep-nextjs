-- Add 'serper' to photo_source constraint (Google Images via Serper API)
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_photo_source_check;
ALTER TABLE products ADD CONSTRAINT products_photo_source_check
  CHECK (photo_source IN ('pos', 'ean', 'manual', 'serper'));
