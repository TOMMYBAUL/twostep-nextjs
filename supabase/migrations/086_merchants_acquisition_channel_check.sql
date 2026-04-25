-- Migration 086: contrainte CHECK sur acquisition_channel
-- Suit code review Task 0.1 (Phase 0 V2) : doc en prose ne suffit pas, enforce DB-level.
-- Valeurs admises : terrain | apporteur | inbound | referral | autre | NULL

ALTER TABLE merchants
  DROP CONSTRAINT IF EXISTS merchants_acquisition_channel_check;

ALTER TABLE merchants
  ADD CONSTRAINT merchants_acquisition_channel_check
  CHECK (
    acquisition_channel IS NULL
    OR acquisition_channel IN ('terrain', 'apporteur', 'inbound', 'referral', 'autre')
  );
