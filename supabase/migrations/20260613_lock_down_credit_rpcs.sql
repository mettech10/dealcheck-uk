-- ─────────────────────────────────────────────────────────────────────────
-- 20260613 — lock down credit-mutating RPCs (revoke PUBLIC execute)
-- ─────────────────────────────────────────────────────────────────────────
--
-- CRITICAL payment-bypass fix found via Supabase security advisor + a
-- has_function_privilege() audit on 2026-06-13:
--
--   add_analysis_credits, admin_grant_credits, consume_ppa_credit_for_-
--   analysis, deduct_one_credit, decrement_paid_credits, increment_free_-
--   usage, get_user_tier and get_user_credit_state were all executable by
--   the `anon` and `authenticated` PostgREST roles — they inherited the
--   default PUBLIC EXECUTE grant that the original migrations never
--   revoked (they only added an explicit GRANT to service_role on top).
--
--   Impact: anyone holding the public anon key could call, e.g.,
--     POST /rest/v1/rpc/add_analysis_credits {p_user_id:<self>, p_credits:9999}
--   to grant themselves unlimited paid credits, or admin_grant_credits to
--   the same effect, or deduct_one_credit / increment_free_usage against
--   any user_id to exhaust their balance. These are SECURITY DEFINER, so
--   they run with full privileges regardless of the caller.
--
-- Every legitimate caller in the app invokes these through the
-- service-role admin client (verified: the only user-session RPC in the
-- codebase is increment_deal_count_rpc, deliberately left public). So
-- revoking PUBLIC/anon/authenticated here changes no supported behaviour
-- while closing the bypass. Reversible: re-GRANT if a future flow needs it.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  fn TEXT;
  fns TEXT[] := ARRAY[
    'public.add_analysis_credits(uuid,integer,varchar,varchar,numeric,uuid)',
    'public.admin_grant_credits(uuid,integer,uuid,text)',
    'public.consume_ppa_credit_for_analysis(uuid,uuid)',
    'public.deduct_one_credit(uuid)',
    'public.decrement_paid_credits(uuid,date)',
    'public.increment_free_usage(uuid,date)',
    'public.get_user_tier(uuid)',
    'public.get_user_credit_state(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    -- Skip cleanly if a signature ever drifts rather than failing the run.
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    ELSE
      RAISE NOTICE 'skip (not found): %', fn;
    END IF;
  END LOOP;
END$$;
