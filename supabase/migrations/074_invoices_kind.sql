-- Migration 074 — Invoice kind + corrective link (Plan 05 Task 6)
-- Enables the "hard cancel within 10 min / corrective negative after"
-- strategy for invoice cancellation.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'standard';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS corrects_invoice_id uuid
    REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_corrects
    ON invoices (corrects_invoice_id)
    WHERE corrects_invoice_id IS NOT NULL;
