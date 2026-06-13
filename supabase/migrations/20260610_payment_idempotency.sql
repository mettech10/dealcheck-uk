-- ─────────────────────────────────────────────────────────────────────────
-- 20260610 — payment idempotency + paid-credit carry-over
-- ─────────────────────────────────────────────────────────────────────────
--
-- Fixes three credit-ledger integrity bugs found in the 2026-06 review:
--
--   1. DOUBLE-CREDIT RACE — the Stripe webhook and /payment-success's
--      verify-session both SELECT-then-grant on stripe_session_id with no
--      unique constraint backing them. If both read "no row" before either
--      inserts, the user gets +2 credits for one payment. Fix: partial
--      unique index + add_analysis_credits made idempotent (the
--      payment_history insert is now the FIRST statement and the function
--      returns early when the session id was already recorded).
--
--   2. RENEWAL DUPLICATES — invoice.payment_succeeded inserts had no
--      dedup at all, so Stripe retries inflated revenue rows and sent
--      duplicate renewal emails. Fix: unique index on succeeded invoice
--      rows (failed attempts stay unconstrained — Stripe legitimately
--      retries the same invoice several times).
--
--   3. PAID CREDITS EXPIRED MONTHLY — user_usage is bucketed by month and
--      add_analysis_credits/deduct_one_credit only touch the current
--      month's row, so a credit bought in May but unused was invisible in
--      June. Fix: get_user_tier (the analyse gate, called before every
--      run) now rolls unspent paid credits forward into the current
--      period before reading the balance.
--
-- Also sets credit_delta on Stripe PPA purchases — previously left NULL,
-- which made get_user_credit_state's "total purchased" under-count every
-- real purchase (only the 20260524 backfill rows had it).
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────


-- ── 1a. Free the namespace: tag any existing duplicate rows ─────────────
-- Keeps every row (audit trail) but renames later duplicates so the
-- unique indexes below can be created. Rows tagged '-dup-<id>' are the
-- double-grants this migration exists to prevent; reconcile manually if
-- any appear.
WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY stripe_session_id
           ORDER BY created_at, id
         ) AS rn
  FROM payment_history
  WHERE stripe_session_id IS NOT NULL
)
UPDATE payment_history ph
SET stripe_session_id = ph.stripe_session_id || '-dup-' || ph.id
FROM dups
WHERE ph.id = dups.id AND dups.rn > 1;

WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY stripe_invoice_id
           ORDER BY created_at, id
         ) AS rn
  FROM payment_history
  WHERE stripe_invoice_id IS NOT NULL
    AND status = 'succeeded'
)
UPDATE payment_history ph
SET stripe_invoice_id = ph.stripe_invoice_id || '-dup-' || ph.id
FROM dups
WHERE ph.id = dups.id AND dups.rn > 1;


-- ── 1b. Unique indexes (the actual backstop) ─────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS payment_history_stripe_session_uniq
  ON payment_history (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_history_invoice_succeeded_uniq
  ON payment_history (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL AND status = 'succeeded';


-- ── 2. add_analysis_credits — idempotent + credit_delta ─────────────────
-- The payment_history insert moves to the FRONT and arbitrates on the
-- unique session index. A duplicate call (webhook retry, webhook vs
-- verify-session race) inserts nothing and returns before touching the
-- credit counter or subscription tier.
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
  INSERT INTO payment_history (
    user_id, stripe_session_id, amount_gbp, tier, status, description,
    analysis_id, event_type, credit_delta
  ) VALUES (
    p_user_id, p_stripe_session_id, p_amount_gbp, p_tier,
    'succeeded',
    CASE
      WHEN p_analysis_id IS NULL
        THEN CONCAT(p_credits, ' analysis credit(s) purchased')
      ELSE 'PDF + save unlocked for analysis ' || p_analysis_id::text
    END,
    p_analysis_id, 'purchase_stripe', p_credits
  )
  ON CONFLICT (stripe_session_id) WHERE stripe_session_id IS NOT NULL
  DO NOTHING;

  -- Duplicate delivery of the same Stripe session — credits were already
  -- granted by the first call. Nothing else to do.
  IF NOT FOUND THEN
    RETURN;
  END IF;

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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION add_analysis_credits(UUID, INTEGER, VARCHAR, VARCHAR, DECIMAL, UUID)
  TO service_role;


-- ── 3. get_user_tier — carry unspent paid credits into the new month ────
-- Identical to the 20260601 version plus the roll-forward block. Paid
-- credits are purchased outright and must not expire with the calendar
-- month; free quota stays monthly by design.
CREATE OR REPLACE FUNCTION public.get_user_tier(p_user_id uuid)
 RETURNS TABLE(
   tier character varying,
   status character varying,
   free_analyses_used integer,
   paid_credits_remaining integer,
   can_analyse boolean,
   limit_reason text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tier VARCHAR;
  v_status VARCHAR;
  v_free_used INTEGER := 0;
  v_paid_credits INTEGER := 0;
  v_period DATE;
  v_carry INTEGER := 0;
  v_free_cap CONSTANT INTEGER := 3;
BEGIN
  v_period := DATE_TRUNC('month', NOW())::DATE;

  -- Carry over unspent paid credits from earlier periods into the current
  -- one. Lock the source rows first (a plain SELECT — FOR UPDATE cannot be
  -- combined with an aggregate), so two concurrent callers can't both
  -- carry the same credits: the second blocks, then its WHERE re-check
  -- sees the now-zeroed rows and carries nothing. Then sum the OLD
  -- balances before zeroing (UPDATE ... RETURNING would give the
  -- post-update value, i.e. 0, in Postgres < 18).
  PERFORM 1
  FROM user_usage
  WHERE user_id = p_user_id
    AND period_start < v_period
    AND paid_analysis_credits > 0
  FOR UPDATE;

  SELECT COALESCE(SUM(paid_analysis_credits), 0) INTO v_carry
  FROM user_usage
  WHERE user_id = p_user_id
    AND period_start < v_period
    AND paid_analysis_credits > 0;

  IF v_carry > 0 THEN
    UPDATE user_usage
    SET paid_analysis_credits = 0,
        updated_at = NOW()
    WHERE user_id = p_user_id
      AND period_start < v_period
      AND paid_analysis_credits > 0;

    INSERT INTO user_usage (user_id, period_start, paid_analysis_credits)
    VALUES (p_user_id, v_period, v_carry)
    ON CONFLICT (user_id, period_start)
    DO UPDATE SET
      paid_analysis_credits = user_usage.paid_analysis_credits + EXCLUDED.paid_analysis_credits,
      updated_at = NOW();
  END IF;

  SELECT COALESCE(us.tier, 'free'), COALESCE(us.status, 'active')
  INTO v_tier, v_status
  FROM user_subscriptions us
  WHERE us.user_id = p_user_id
  LIMIT 1;

  IF v_tier IS NULL THEN
    v_tier := 'free';
    v_status := 'active';
  END IF;

  SELECT COALESCE(uu.free_analyses_used, 0), COALESCE(uu.paid_analysis_credits, 0)
  INTO v_free_used, v_paid_credits
  FROM user_usage uu
  WHERE uu.user_id = p_user_id AND uu.period_start = v_period
  LIMIT 1;

  IF v_free_used IS NULL THEN v_free_used := 0; END IF;
  IF v_paid_credits IS NULL THEN v_paid_credits := 0; END IF;

  RETURN QUERY SELECT
    v_tier, v_status, v_free_used, v_paid_credits,
    CASE
      WHEN v_tier IN ('pro', 'enterprise') AND v_status IN ('active', 'trialing') THEN TRUE
      WHEN v_status IN ('past_due', 'cancelled') THEN FALSE
      WHEN v_paid_credits > 0 THEN TRUE
      -- Free monthly quota — universal baseline, not tier-gated.
      WHEN v_free_used < v_free_cap THEN TRUE
      ELSE FALSE
    END,
    CASE
      WHEN v_tier IN ('pro', 'enterprise') AND v_status IN ('active', 'trialing') THEN NULL
      WHEN v_status = 'past_due' THEN 'past_due'
      WHEN v_status = 'cancelled' THEN 'cancelled'
      WHEN v_paid_credits > 0 THEN NULL
      WHEN v_free_used < v_free_cap THEN NULL
      WHEN v_tier = 'pay_per_analysis' THEN 'no_credits'
      ELSE 'free_limit_reached'
    END;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_user_tier(uuid) TO authenticated, service_role;
