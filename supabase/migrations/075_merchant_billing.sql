-- Migration 075 — Merchant billing (Stripe subscription lifecycle)
-- Adds columns needed to track Stripe subscription state per merchant:
--   billing_status      — current lifecycle state (pending → trialing → active → …)
--   stripe_subscription_id — Stripe sub id for lookups / portal
--   trial_ends_at       — when the 30-day free trial ends (from Stripe)
--   current_period_end  — next billing date (from Stripe)
-- Also fixes the legacy `plan` CHECK constraint which allowed
-- ('free','standard','premium') but conflicted with the three tiers actually
-- used by the app (pioneer / early / standard).

-- 1) Relax + update the `plan` column to reflect actual tiers
ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_plan_check;

-- Migrate existing rows from legacy values to new ones
UPDATE merchants SET plan = 'pioneer' WHERE plan IN ('standard', 'premium');
-- 'free' stays 'free' for merchants who haven't started billing yet

ALTER TABLE merchants ADD CONSTRAINT merchants_plan_check
    CHECK (plan IN ('free', 'pioneer', 'early', 'standard'));

-- 2) New billing state columns
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS billing_status text
    NOT NULL DEFAULT 'pending'
    CHECK (billing_status IN (
        'pending',          -- merchant created, hasn't been to Checkout yet
        'trialing',         -- in 30-day trial, subscription active in Stripe
        'active',           -- paying customer
        'payment_required', -- last invoice failed, needs to update CB
        'canceled'          -- subscription ended (voluntary or involuntary)
    ));

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

CREATE INDEX IF NOT EXISTS idx_merchants_billing_status
    ON merchants (billing_status);

CREATE INDEX IF NOT EXISTS idx_merchants_stripe_subscription_id
    ON merchants (stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL;
