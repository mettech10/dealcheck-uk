-- ─────────────────────────────────────────────────────────────────────────
-- 20260524 — credit audit trail extensions
-- ─────────────────────────────────────────────────────────────────────────
--
-- Pure-additive extension of payment_history so it can carry NON-Stripe
-- credit events (manual admin grants, per-analysis consumption, Pro
-- cancellations) alongside the existing Stripe purchase rows. Keeps a
-- single source of truth for "everything that ever happened to a
-- user's credit balance" — the alternative (a parallel
-- credit_transactions table) creates drift between the two.
--
-- The user-facing Credit History on /account and the admin Credits
-- panel both query this table directly.
-- ─────────────────────────────────────────────────────────────────────────

-- ── New columns ──────────────────────────────────────────────────────────
ALTER TABLE payment_history
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'purchase_stripe',
  -- 'purchase_stripe' (existing rows, default) — Stripe charge
  -- 'admin_grant'    — admin manually added credits
  -- 'analysis_used'  — user consumed a credit on an analysis
  -- 'pro_cancelled'  — Pro subscription ended, credits reset
  -- 'refund'         — Stripe refund issued (future)
  ADD COLUMN IF NOT EXISTS credit_delta INTEGER,
  -- Signed: +1 for purchase/grant, -1 for analysis_used, 0 for
  -- Pro purchases (Pro is unlimited not credit-based). Kept
  -- separate from amount_gbp so we can sum balance changes
  -- without filtering on tier.
  ADD COLUMN IF NOT EXISTS notes TEXT,
  -- Free-text reason: "Admin top-up for support case", "Analysis at M14 4AB", …
  ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Set when event_type = 'admin_grant' so we know who granted what.
  ADD COLUMN IF NOT EXISTS processed BOOLEAN NOT NULL DEFAULT TRUE;
  -- Idempotency flag for verify-session: a row added by the webhook
  -- is `processed=true`; one inserted by the client-initiated
  -- verify-session route is also `true`. The flag exists so a
  -- future "pending then confirmed" workflow can use it without
  -- another migration.

-- Indexes for the two main query patterns:
--   /account Credit History → all events for one user, newest first
--   /admin Credits table    → all events filtered by event_type
CREATE INDEX IF NOT EXISTS payment_history_user_event_idx
  ON payment_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_history_event_type_idx
  ON payment_history (event_type, created_at DESC);


-- ── RPC: get_user_credit_state ──────────────────────────────────────────
-- Single read for everything the UI needs to render the credit card +
-- nav pill. Wraps user_subscriptions + user_usage + payment_history so
-- callers don't have to compose the join themselves.
CREATE OR REPLACE FUNCTION get_user_credit_state(p_user_id UUID)
RETURNS TABLE (
  tier                       VARCHAR,
  status                     VARCHAR,
  is_unlimited               BOOLEAN,
  unlimited_until            TIMESTAMPTZ,
  credit_balance             INTEGER,
  total_credits_purchased    INTEGER,
  total_credits_used         INTEGER,
  free_analyses_used         INTEGER,
  free_limit                 INTEGER,
  last_topped_up_at          TIMESTAMPTZ
) AS $$
DECLARE
  v_period DATE := DATE_TRUNC('month', NOW())::DATE;
BEGIN
  RETURN QUERY
  WITH sub AS (
    SELECT
      us.tier,
      us.status,
      us.current_period_end,
      us.cancel_at_period_end
    FROM user_subscriptions us
    WHERE us.user_id = p_user_id
  ),
  cur AS (
    SELECT
      COALESCE(SUM(uu.paid_analysis_credits), 0)::INTEGER AS balance,
      COALESCE(SUM(uu.free_analyses_used), 0)::INTEGER AS free_used,
      COALESCE(SUM(uu.total_analyses_this_period), 0)::INTEGER AS total_used
    FROM user_usage uu
    WHERE uu.user_id = p_user_id
      AND uu.period_start = v_period
  ),
  totals AS (
    SELECT
      COALESCE(SUM(CASE WHEN ph.credit_delta > 0 THEN ph.credit_delta ELSE 0 END), 0)::INTEGER AS purchased,
      COALESCE(SUM(CASE WHEN ph.credit_delta < 0 THEN -ph.credit_delta ELSE 0 END), 0)::INTEGER AS used,
      MAX(CASE WHEN ph.credit_delta > 0 THEN ph.created_at END) AS last_top_up
    FROM payment_history ph
    WHERE ph.user_id = p_user_id
  )
  SELECT
    COALESCE(sub.tier, 'free')::VARCHAR,
    COALESCE(sub.status, 'active')::VARCHAR,
    (sub.tier IN ('pro', 'enterprise') AND COALESCE(sub.status, 'active') = 'active')::BOOLEAN,
    sub.current_period_end,
    GREATEST(COALESCE(cur.balance, 0), 0),
    COALESCE(totals.purchased, 0),
    COALESCE(totals.used, cur.total_used, 0),
    COALESCE(cur.free_used, 0),
    3,  -- free monthly cap, kept in sync with lib/tiers.FREE_MONTHLY_CAP
    totals.last_top_up
  FROM cur
  LEFT JOIN sub ON TRUE
  LEFT JOIN totals ON TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_credit_state(UUID)
  TO authenticated, service_role;


-- ── RPC: admin_grant_credits ────────────────────────────────────────────
-- Admin-only path. Adds N credits to a user's current-month bucket,
-- logs the grant in payment_history with event_type='admin_grant' +
-- the granting admin's id. Returns the new balance so the UI can
-- update without a re-read.
CREATE OR REPLACE FUNCTION admin_grant_credits(
  p_user_id  UUID,
  p_amount   INTEGER,
  p_admin_id UUID,
  p_notes    TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  v_period  DATE := DATE_TRUNC('month', NOW())::DATE;
  v_balance INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO user_usage (user_id, period_start, paid_analysis_credits)
  VALUES (p_user_id, v_period, GREATEST(p_amount, 0))
  ON CONFLICT (user_id, period_start)
  DO UPDATE SET
    paid_analysis_credits = GREATEST(user_usage.paid_analysis_credits + p_amount, 0),
    updated_at = NOW();

  INSERT INTO payment_history (
    user_id, amount_gbp, tier, status, description,
    event_type, credit_delta, notes, admin_id
  ) VALUES (
    p_user_id, 0, 'pay_per_analysis', 'succeeded',
    CONCAT('Admin grant: ', p_amount, ' credit(s)'),
    'admin_grant', p_amount, p_notes, p_admin_id
  );

  SELECT paid_analysis_credits INTO v_balance
  FROM user_usage
  WHERE user_id = p_user_id AND period_start = v_period;

  RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_grant_credits(UUID, INTEGER, UUID, TEXT)
  TO service_role;


-- ── Backfill credit_delta + event_type for historical Stripe rows ───────
-- Existing PPA rows (one credit each) get credit_delta = +1.
-- Pro rows are unlimited not credit-based → credit_delta = 0.
-- Idempotent — only updates rows where credit_delta IS NULL so a
-- re-run doesn't double-count anything added afterwards.
UPDATE payment_history
SET credit_delta = CASE
  WHEN tier = 'pay_per_analysis' AND status = 'succeeded' THEN 1
  ELSE 0
END
WHERE credit_delta IS NULL;
