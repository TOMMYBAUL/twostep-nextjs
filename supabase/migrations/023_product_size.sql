ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS size TEXT;

CREATE INDEX idx_products_size ON products (size) WHERE size IS NOT NULL;
