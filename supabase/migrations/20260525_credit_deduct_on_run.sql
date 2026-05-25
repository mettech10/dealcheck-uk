-- ─────────────────────────────────────────────────────────────────────────
-- 20260525 — credit deduct on run + admin grants promote tier
-- ─────────────────────────────────────────────────────────────────────────
--
-- Bug fix: admin-granted credits weren't being deducted on analysis
-- run. Root cause: admin_grant_credits added to user_usage.paid_-
-- analysis_credits but didn't touch user_subscriptions.tier, so the
-- user stayed flagged as 'free'. checkCanAnalyse then picked the
-- free path, recordAnalysisUsed called increment_free_usage instead
-- of decrement_paid_credits, and the paid credit just sat there
-- ignored.
--
-- Two fixes:
--   1. admin_grant_credits also bumps tier to 'pay_per_analysis'
--      (only when not already pro/enterprise — never downgrade).
--   2. New deduct_one_credit RPC with the safety floor at 0 — used
--      by the updated recordAnalysisUsed which now always prefers
--      a paid credit when balance > 0, regardless of tier label.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────


-- ── RPC: admin_grant_credits (updated to bump tier) ──────────────────────
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

  -- Promote tier from 'free' → 'pay_per_analysis' so the analyse
  -- gate picks the paid-credit path on the next run. NEVER downgrade
  -- pro/enterprise — those tiers always win over PPA.
  INSERT INTO user_subscriptions (user_id, tier, status)
  VALUES (p_user_id, 'pay_per_analysis', 'active')
  ON CONFLICT (user_id) DO UPDATE
  SET tier = CASE
        WHEN user_subscriptions.tier IN ('pro', 'enterprise')
          THEN user_subscriptions.tier
        ELSE 'pay_per_analysis'
      END,
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


-- ── RPC: deduct_one_credit ───────────────────────────────────────────────
-- Atomic single-credit deduction. Raises if user has none — caller
-- (recordAnalysisUsed) decides whether to fall back to the free
-- counter on failure. Floor at 0 keeps the balance honest if two
-- concurrent requests race.
CREATE OR REPLACE FUNCTION deduct_one_credit(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_period  DATE := DATE_TRUNC('month', NOW())::DATE;
  v_balance INTEGER;
BEGIN
  UPDATE user_usage
  SET
    paid_analysis_credits = paid_analysis_credits - 1,
    total_analyses_this_period = total_analyses_this_period + 1,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND period_start = v_period
    AND paid_analysis_credits >= 1
  RETURNING paid_analysis_credits INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION deduct_one_credit(UUID) TO service_role;
