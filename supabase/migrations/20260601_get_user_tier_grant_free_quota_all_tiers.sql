-- 20260601 — get_user_tier: grant the 3 free monthly analyses to ALL
-- non-Pro/Enterprise tiers, not just literal tier='free'.
--
-- The previous can_analyse clause was:
--   WHEN v_tier = 'free' AND v_free_used < 3 THEN TRUE
-- which meant once a user bought a single Pay-Per-Analysis credit (which
-- permanently moves them from tier='free' to tier='pay_per_analysis'),
-- their 3 free monthly analyses became inaccessible forever — every
-- new month they'd see "no_credits" + the upgrade modal even though
-- the front-end credit pill correctly showed "3 credits available"
-- (the pill uses get_user_credit_state which derives canAnalyse from
-- free_used < free_limit, with no tier guard).
--
-- Live symptom (2026-06-01 alisayeerumman@gmail.com):
--   - Frontend pill: 3 credits available
--   - User clicks Analyse → client-side ensureCreditOrGate passes
--     (uses /api/user/credits → get_user_credit_state → canAnalyse=true)
--   - Local form calculations render (yield, cashflow, score)
--   - Server-side /api/analyse → checkCanAnalyse → get_user_tier
--     returns can_analyse=FALSE → 402
--   - Upgrade modal opens
--   - Frontend abandons the response, so ai_strengths / ai_risks /
--     ai_next_steps never populate → results page is missing those
--     three panels.
--
-- Fix:
--   1. Drop the tier guard on the free-quota branch. Free quota is
--      now a baseline granted to every non-Pro/Enterprise account
--      that isn't past_due / cancelled.
--   2. limit_reason now only returns 'no_credits' / 'free_limit_reached'
--      when BOTH pools are exhausted, instead of firing 'no_credits'
--      as soon as a PPA user's paid balance hits zero.

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
  v_free_cap CONSTANT INTEGER := 3;
BEGIN
  v_period := DATE_TRUNC('month', NOW())::DATE;

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
