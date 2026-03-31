ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS available_sizes JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.products.available_sizes IS 'Array of {size, quantity} for size variants, e.g. [{"size":"42","quantity":3}]';
