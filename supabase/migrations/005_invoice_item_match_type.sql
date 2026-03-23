-- Add match_type to invoice_items to track how products were matched
ALTER TABLE invoice_items
    ADD COLUMN match_type text DEFAULT NULL
        CHECK (match_type IN ('exact_ean', 'exact_name', 'fuzzy', NULL));
