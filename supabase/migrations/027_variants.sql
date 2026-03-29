-- Product variant grouping: link size variants to a principal product
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS variant_of UUID REFERENCES public.products(id) ON DELETE SET NULL;

-- Visibility flag: false for products without EAN that need manual completion
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS visible BOOLEAN DEFAULT true;

-- Index for fast consumer queries (exclude variants)
CREATE INDEX IF NOT EXISTS idx_products_variant_of ON products(variant_of) WHERE variant_of IS NOT NULL;

-- Index for fast visibility filter
CREATE INDEX IF NOT EXISTS idx_products_visible ON products(visible) WHERE visible = false;
