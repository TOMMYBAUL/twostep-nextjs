-- Add brand column to invoice_items for CSV/facture parsing
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS brand text;
