-- ─────────────────────────────────────────────────────────────────────────
-- 20260523 — Pay-Per-Analysis per-deal binding
-- ─────────────────────────────────────────────────────────────────────────
--
-- The original PPA model (20260515_payments_and_usage.sql) granted a
-- generic credit that didn't link to any specific saved analysis. With
-- the 2026-05 tier rules (Free can see everything but only paid users
-- can export PDF / save) we need to know WHICH analysis a credit
-- unlocks. Two binding modes:
--
--   A. Bind at checkout — frontend knows the analysis id at the
--      "Buy 1 Analysis" click. analysis_id rides in Stripe metadata
--      and the webhook stores it on payment_history directly.
--
--   B. Floating credit — user paid generically (e.g. from /pricing
--      before running any analysis). payment_history.analysis_id is
--      NULL. Later, the first Save-Deal / Export-PDF click on any
--      analysis consumes the floating credit and binds it.
--
-- Both modes converge on the same invariant:
--   payment_history has a row with (user_id, analysis_id, tier='pay_per_analysis')
--   ⇒ that user has unlocked PDF / save for that analysis.
--
-- This migration is additive — existing payment_history rows (which
-- never had analysis_id) become "floating credits" that the consume
-- RPC can bind. No data backfill needed.
-- ─────────────────────────────────────────────────────────────────────────


-- ─── Column ──────────────────────────────────────────────────────────────
ALTER TABLE payment_history
  ADD COLUMN IF NOT EXISTS analysis_id UUID
  REFERENCES saved_analyses(id) ON DELETE SET NULL;

-- Lookup index for canExportPDFForAnalysis(userId, analysisId).
CREATE INDEX IF NOT EXISTS payment_history_user_analysis_idx
  ON payment_history (user_id, analysis_id)
  WHERE analysis_id IS NOT NULL;

-- Partial index for the floating-credit pool (the candidate set
-- consume_ppa_credit_for_analysis() picks from).
CREATE INDEX IF NOT EXISTS payment_history_floating_credits_idx
  ON payment_history (user_id, created_at)
  WHERE analysis_id IS NULL
    AND tier = 'pay_per_analysis'
    AND status = 'succeeded';


-- ─── RPC: add_analysis_credits (updated to accept p_analysis_id) ─────────
-- Backwards-compatible: existing callers (webhook today) pass 5 args
-- and get the same behaviour. New callers may pass p_analysis_id to
-- bind the credit immediately at checkout. We DROP the old signature
-- so PostgREST resolves the new 6-arg version unambiguously.
DROP FUNCTION IF EXISTS add_analysis_credits(UUID, INTEGER, VARCHAR, VARCHAR, DECIMAL);

CREATE OR REPLACE FUNCTION add_analysis_credits(
  p_user_id UUID,
  p_credits INTEGER,
  p_tier VARCHAR DEFAULT 'pay_per_analysis',
  p_stripe_session_id VARCHAR DEFAULT NULL,
  p_amount_gbp DECIMAL DEFAULT 2.99,
  p_analysis_id UUID DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_period DATE := DATE_TRUNC('month', NOW())::DATE;
BEGIN
  INSERT INTO user_usage (user_id, period_start, paid_analysis_credits)
  VALUES (p_user_id, v_period, p_credits)
  ON CONFLICT (user_id, period_start)
  DO UPDATE SET
    paid_analysis_credits = user_usage.paid_analysis_credits + p_credits,
    updated_at = NOW();

  INSERT INTO user_subscriptions (user_id, tier, status)
  VALUES (p_user_id, p_tier, 'active')
  ON CONFLICT (user_id) DO UPDATE
  SET tier = CASE
        WHEN user_subscriptions.tier IN ('pro', 'enterprise')
          THEN user_subscriptions.tier
        ELSE p_tier
      END,
      updated_at = NOW();

  INSERT INTO payment_history (
    user_id, stripe_session_id, amount_gbp, tier, status, description, analysis_id
  ) VALUES (
    p_user_id, p_stripe_session_id, p_amount_gbp, p_tier,
    'succeeded',
    CASE
      WHEN p_analysis_id IS NULL
        THEN CONCAT(p_credits, ' analysis credit(s) purchased')
      ELSE 'PDF + save unlocked for analysis ' || p_analysis_id::text
    END,
    p_analysis_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION add_analysis_credits(UUID, INTEGER, VARCHAR, VARCHAR, DECIMAL, UUID)
  TO service_role;


-- ─── RPC: consume_ppa_credit_for_analysis ────────────────────────────────
-- Atomically bind a floating PPA credit to a specific analysis.
--
-- Logic:
--   1. If the user already has a payment_history row for this analysis,
--      return TRUE (idempotent — caller can re-invoke safely).
--   2. Otherwise look for the OLDEST floating PPA credit (analysis_id
--      IS NULL, tier='pay_per_analysis', status='succeeded') belonging
--      to the user. Lock it FOR UPDATE so two concurrent unlocks can't
--      both consume the same credit.
--   3. If found: SET analysis_id = p_analysis_id, return TRUE.
--      Also decrement paid_analysis_credits so /api/usage reflects
--      that one credit has been spent.
--   4. If no floating credit found: return FALSE — caller should
--      surface the upgrade modal.
--
-- SECURITY DEFINER + check that caller is the same user (passed by the
-- API route, which already auth-gates). RLS doesn't apply inside
-- SECURITY DEFINER, so the WHERE user_id = p_user_id clause is the
-- only guard — be careful not to call this with a user id from
-- untrusted input.
CREATE OR REPLACE FUNCTION consume_ppa_credit_for_analysis(
  p_user_id UUID,
  p_analysis_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_period DATE := DATE_TRUNC('month', NOW())::DATE;
  v_credit_id UUID;
BEGIN
  -- Idempotency: already bound for this analysis?
  IF EXISTS (
    SELECT 1 FROM payment_history
    WHERE user_id = p_user_id
      AND analysis_id = p_analysis_id
      AND tier = 'pay_per_analysis'
      AND status = 'succeeded'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Grab the oldest floating credit, locked against concurrent consumers.
  SELECT id INTO v_credit_id
  FROM payment_history
  WHERE user_id = p_user_id
    AND analysis_id IS NULL
    AND tier = 'pay_per_analysis'
    AND status = 'succeeded'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_credit_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Bind the credit to this analysis.
  UPDATE payment_history
  SET analysis_id = p_analysis_id,
      description = 'PDF + save unlocked for analysis ' || p_analysis_id::text
  WHERE id = v_credit_id;

  -- Mirror the spend on the counter so /api/usage no longer claims a
  -- spare credit. GREATEST() guards against pre-migration rows where
  -- the counter is already 0.
  UPDATE user_usage
  SET
    paid_analysis_credits = GREATEST(paid_analysis_credits - 1, 0),
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND period_start = v_period;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION consume_ppa_credit_for_analysis(UUID, UUID)
  TO service_role;


-- ─── Convenience view: floating credit count per user ────────────────────
-- Used by the frontend hook to decide whether to show
-- "Use 1 credit to unlock" vs. "Upgrade to Pro" on the Save / PDF buttons.
CREATE OR REPLACE VIEW user_floating_credits AS
SELECT
  user_id,
  COUNT(*)::INTEGER AS floating_credits
FROM payment_history
WHERE analysis_id IS NULL
  AND tier = 'pay_per_analysis'
  AND status = 'succeeded'
GROUP BY user_id;

GRANT SELECT ON user_floating_credits TO authenticated, service_role;
