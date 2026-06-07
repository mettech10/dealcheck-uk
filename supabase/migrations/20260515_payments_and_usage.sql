-- ─────────────────────────────────────────────────────────────────────────
-- Payments, subscriptions and usage gating schema
-- Section 3 of the Stripe payments / tier-gating build.
--
-- Three tables:
--   user_subscriptions  — one row per user, current tier + Stripe ids
--   user_usage          — month-by-month free + paid analysis counters
--   payment_history     — append-only log of every Stripe transaction
--
-- Two RPCs:
--   get_user_tier(user_id)          — read-side: tier + can_analyse +
--                                      reason for blocked
--   add_analysis_credits(...)        — write-side: Pay-Per-Analysis
--                                      webhook calls this to grant +1
--                                      credit + log payment
--   increment_free_usage(...)        — write-side: free-tier analysis
--                                      records consumption
--   decrement_paid_credits(...)      — write-side: PPA-tier analysis
--                                      records consumption
--
-- All tables have RLS enabled. Service role bypasses; users read their
-- own rows via auth.uid() = user_id policy.
--
-- Safe to re-run (CREATE IF NOT EXISTS, OR REPLACE FUNCTION).
-- ─────────────────────────────────────────────────────────────────────────

-- ─── user_subscriptions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tier VARCHAR(50) NOT NULL DEFAULT 'free',
    -- 'free' | 'pay_per_analysis' | 'pro' | 'enterprise'
  status VARCHAR(50) NOT NULL DEFAULT 'active',
    -- 'active' | 'past_due' | 'cancelled' | 'trialing'
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_subscriptions_stripe_customer_idx
  ON user_subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS user_subscriptions_stripe_sub_idx
  ON user_subscriptions (stripe_subscription_id);

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_subscriptions read own"     ON user_subscriptions;
DROP POLICY IF EXISTS "user_subscriptions service all"  ON user_subscriptions;

CREATE POLICY "user_subscriptions read own"
  ON user_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_subscriptions service all"
  ON user_subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ─── user_usage ──────────────────────────────────────────────────────────
-- One row per (user, calendar month). period_start = DATE_TRUNC('month').
-- free_analyses_used   — counts toward 3/month Free-tier cap
-- paid_analysis_credits — accumulated Pay-Per-Analysis purchases,
--                         decremented when used
-- total_analyses_this_period — every analysis, for metrics
CREATE TABLE IF NOT EXISTS user_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  free_analyses_used INTEGER NOT NULL DEFAULT 0,
  paid_analysis_credits INTEGER NOT NULL DEFAULT 0,
  total_analyses_this_period INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, period_start)
);

CREATE INDEX IF NOT EXISTS user_usage_user_idx
  ON user_usage (user_id, period_start DESC);

ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_usage read own"    ON user_usage;
DROP POLICY IF EXISTS "user_usage service all" ON user_usage;

CREATE POLICY "user_usage read own"
  ON user_usage
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_usage service all"
  ON user_usage
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ─── payment_history ─────────────────────────────────────────────────────
-- Append-only log of every Stripe transaction. Indexed by user for the
-- /account payment-history view.
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_session_id VARCHAR(200),
  stripe_payment_intent VARCHAR(200),
  stripe_invoice_id VARCHAR(200),
  amount_gbp DECIMAL(10, 2),
  tier VARCHAR(50),
  status VARCHAR(50),
    -- 'succeeded' | 'failed' | 'refunded' | 'pending'
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_history_user_idx
  ON payment_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_history_session_idx
  ON payment_history (stripe_session_id);

ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_history read own"    ON payment_history;
DROP POLICY IF EXISTS "payment_history service all" ON payment_history;

CREATE POLICY "payment_history read own"
  ON payment_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "payment_history service all"
  ON payment_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ─── RPC: get_user_tier ──────────────────────────────────────────────────
-- One-call read for the usage gate. Returns the user's current tier,
-- subscription status, free + paid usage for the current month, plus a
-- precomputed `can_analyse` bool and `limit_reason` so the frontend can
-- pick the right paywall message (free_limit_reached / no_credits / null).
CREATE OR REPLACE FUNCTION get_user_tier(p_user_id UUID)
RETURNS TABLE (
  tier VARCHAR,
  status VARCHAR,
  free_analyses_used INTEGER,
  paid_credits_remaining INTEGER,
  can_analyse BOOLEAN,
  limit_reason TEXT
) AS $$
DECLARE
  v_tier VARCHAR;
  v_status VARCHAR;
  v_free_used INTEGER := 0;
  v_paid_credits INTEGER := 0;
  v_period DATE;
BEGIN
  v_period := DATE_TRUNC('month', NOW())::DATE;

  SELECT
    COALESCE(us.tier, 'free'),
    COALESCE(us.status, 'active')
  INTO v_tier, v_status
  FROM user_subscriptions us
  WHERE us.user_id = p_user_id
  LIMIT 1;

  IF v_tier IS NULL THEN
    v_tier := 'free';
    v_status := 'active';
  END IF;

  SELECT
    COALESCE(uu.free_analyses_used, 0),
    COALESCE(uu.paid_analysis_credits, 0)
  INTO v_free_used, v_paid_credits
  FROM user_usage uu
  WHERE uu.user_id = p_user_id
    AND uu.period_start = v_period
  LIMIT 1;

  IF v_free_used IS NULL THEN v_free_used := 0; END IF;
  IF v_paid_credits IS NULL THEN v_paid_credits := 0; END IF;

  RETURN QUERY SELECT
    v_tier,
    v_status,
    v_free_used,
    v_paid_credits,
    CASE
      -- Pro: unlimited if active. past_due still allowed during grace.
      WHEN v_tier = 'pro' AND v_status IN ('active', 'trialing') THEN TRUE
      -- Enterprise treated as unlimited.
      WHEN v_tier = 'enterprise' AND v_status IN ('active', 'trialing') THEN TRUE
      -- Pay Per Analysis: only if credits remain.
      WHEN v_paid_credits > 0 THEN TRUE
      -- Free: up to 3 / month.
      WHEN v_tier = 'free' AND v_free_used < 3 THEN TRUE
      ELSE FALSE
    END,
    CASE
      WHEN v_tier IN ('pro', 'enterprise') AND v_status IN ('active', 'trialing') THEN NULL
      WHEN v_paid_credits > 0 THEN NULL
      WHEN v_tier = 'pay_per_analysis' AND v_paid_credits = 0 THEN 'no_credits'
      WHEN v_tier = 'free' AND v_free_used >= 3 THEN 'free_limit_reached'
      WHEN v_status = 'past_due' THEN 'past_due'
      WHEN v_status = 'cancelled' THEN 'cancelled'
      ELSE NULL
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_tier(UUID) TO authenticated, service_role;


-- ─── RPC: add_analysis_credits ───────────────────────────────────────────
-- Called by the Stripe webhook after a successful Pay-Per-Analysis
-- checkout. Adds +N to paid_analysis_credits AND logs the payment.
-- Atomic: both writes in one function call.
CREATE OR REPLACE FUNCTION add_analysis_credits(
  p_user_id UUID,
  p_credits INTEGER,
  p_tier VARCHAR DEFAULT 'pay_per_analysis',
  p_stripe_session_id VARCHAR DEFAULT NULL,
  p_amount_gbp DECIMAL DEFAULT 2.99
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

  -- Set tier to pay_per_analysis (unless already pro/enterprise — never
  -- downgrade a Pro subscriber who happens to also buy a one-off).
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
    user_id, stripe_session_id, amount_gbp, tier, status, description
  ) VALUES (
    p_user_id, p_stripe_session_id, p_amount_gbp, p_tier,
    'succeeded', CONCAT(p_credits, ' analysis credit(s) purchased')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION add_analysis_credits(UUID, INTEGER, VARCHAR, VARCHAR, DECIMAL)
  TO service_role;


-- ─── RPC: increment_free_usage ───────────────────────────────────────────
-- Called after a Free-tier user runs an analysis. Bumps the free counter
-- + the totals counter atomically.
CREATE OR REPLACE FUNCTION increment_free_usage(
  p_user_id UUID,
  p_period DATE DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_period DATE := COALESCE(p_period, DATE_TRUNC('month', NOW())::DATE);
BEGIN
  INSERT INTO user_usage (
    user_id, period_start, free_analyses_used, total_analyses_this_period
  )
  VALUES (p_user_id, v_period, 1, 1)
  ON CONFLICT (user_id, period_start)
  DO UPDATE SET
    free_analyses_used = user_usage.free_analyses_used + 1,
    total_analyses_this_period = user_usage.total_analyses_this_period + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_free_usage(UUID, DATE) TO authenticated, service_role;


-- ─── RPC: decrement_paid_credits ─────────────────────────────────────────
-- Called after a PPA-tier user runs an analysis. Decrements paid credits
-- (never below 0) and bumps the totals counter.
CREATE OR REPLACE FUNCTION decrement_paid_credits(
  p_user_id UUID,
  p_period DATE DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_period DATE := COALESCE(p_period, DATE_TRUNC('month', NOW())::DATE);
BEGIN
  UPDATE user_usage
  SET
    paid_analysis_credits = GREATEST(paid_analysis_credits - 1, 0),
    total_analyses_this_period = total_analyses_this_period + 1,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND period_start = v_period;

  -- If no row exists yet for this period, create one (defensive — should
  -- only happen if a credit was granted in a prior period and is being
  -- used in this period; we leave paid_credits at 0 in that case).
  IF NOT FOUND THEN
    INSERT INTO user_usage (
      user_id, period_start, total_analyses_this_period
    ) VALUES (p_user_id, v_period, 1);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION decrement_paid_credits(UUID, DATE) TO authenticated, service_role;
