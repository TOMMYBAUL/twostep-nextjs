-- Migration 076 — Atomic signup rank + tier cap enforcement
-- Fixes two race conditions in plans.ts resolveTierForNextSignup():
--   1) Concurrent checkouts could all see activeCount < 30 and all land as
--      Pioneer, exceeding the 30-slot cap.
--   2) A Pioneer cancelling used to free the slot; product decision is that
--      the Pioneer allocation is HISTORICAL — once the 30 ranks are claimed,
--      they never come back (prevents cancel/resubscribe gaming).
--
-- The column signup_order_rank is assigned exactly once, at the moment the
-- merchant clicks "Démarrer mes 30 jours gratuits" (i.e. in the Stripe
-- Checkout route). Tier is derived from rank in app code:
--   rank 1..30  -> pioneer
--   rank 31..50 -> early
--   rank 51+    -> standard

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS signup_order_rank INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_signup_order_rank
    ON merchants (signup_order_rank)
    WHERE signup_order_rank IS NOT NULL;

-- Atomic claim protected by a session-level advisory lock so concurrent
-- checkouts cannot observe the same COUNT and both claim the same slot.
CREATE OR REPLACE FUNCTION claim_signup_slot(p_merchant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing_rank INTEGER;
    v_next_rank INTEGER;
BEGIN
    -- Serialize concurrent claims on a shared lock key.
    PERFORM pg_advisory_xact_lock(hashtext('signup_slot_claim'));

    SELECT signup_order_rank INTO v_existing_rank
    FROM merchants WHERE id = p_merchant_id;

    IF v_existing_rank IS NOT NULL THEN
        RETURN v_existing_rank;
    END IF;

    SELECT COALESCE(MAX(signup_order_rank), 0) + 1 INTO v_next_rank
    FROM merchants;

    UPDATE merchants
    SET signup_order_rank = v_next_rank
    WHERE id = p_merchant_id;

    RETURN v_next_rank;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_signup_slot(UUID) TO authenticated, service_role;
