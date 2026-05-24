/**
 * Server-side usage gate for the analyse flow.
 *
 * Single call to `get_user_tier(user_id)` (Supabase RPC, see
 * supabase/migrations/20260515_payments_and_usage.sql) returns:
 *   - tier                — free / pay_per_analysis / pro / enterprise
 *   - status              — active / past_due / cancelled / trialing
 *   - free_analyses_used  — counter for current calendar month
 *   - paid_credits_remaining
 *   - can_analyse         — boolean computed server-side
 *   - limit_reason        — null | free_limit_reached | no_credits |
 *                            past_due | cancelled
 *
 * The two writers (increment_free_usage, decrement_paid_credits) are
 * called after a successful analysis to record consumption. Pro and
 * Enterprise tiers run analyses without touching counters; we still
 * bump total_analyses_this_period via increment_free_usage so the
 * metrics view sees them.
 *
 * This file is server-only (uses the service-role admin client). The
 * frontend reaches it via /api/analyse and /api/usage routes.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { FREE_MONTHLY_CAP, type TierId } from "@/lib/tiers"

export interface UsageGateResult {
  canAnalyse: boolean
  tier: TierId
  status: string
  reason: string | null
  freeUsed: number
  freeLimit: number
  paidCredits: number
}

/**
 * Check whether a Supabase user can run another analysis right now.
 *
 * Returns canAnalyse=false with reason="not_logged_in" when userId is
 * null/undefined — the caller decides whether to allow anonymous use
 * (current policy: NO, the analyse button is hidden when not signed in).
 */
export async function checkCanAnalyse(
  userId: string | null | undefined,
): Promise<UsageGateResult> {
  if (!userId) {
    return {
      canAnalyse: false,
      tier: "free",
      status: "anonymous",
      reason: "not_logged_in",
      freeUsed: 0,
      freeLimit: FREE_MONTHLY_CAP,
      paidCredits: 0,
    }
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc("get_user_tier", { p_user_id: userId })
    if (error) {
      console.error("[usageGate] get_user_tier RPC error:", error)
      return failOpen(userId)
    }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return failOpen(userId)
    return {
      canAnalyse: !!row.can_analyse,
      tier: (row.tier as TierId) ?? "free",
      status: row.status ?? "active",
      reason: (row.limit_reason as string | null) ?? null,
      freeUsed: row.free_analyses_used ?? 0,
      freeLimit: FREE_MONTHLY_CAP,
      paidCredits: row.paid_credits_remaining ?? 0,
    }
  } catch (e) {
    console.error("[usageGate] threw:", e)
    return failOpen(userId)
  }
}

/**
 * Fail-open default. On RPC errors we'd rather let the user analyse
 * than block them — fixing a paywall over-blocking incident is much
 * worse than briefly letting through a free-tier user past the cap.
 */
function failOpen(_userId: string): UsageGateResult {
  return {
    canAnalyse: true,
    tier: "free",
    status: "active",
    reason: null,
    freeUsed: 0,
    freeLimit: FREE_MONTHLY_CAP,
    paidCredits: 0,
  }
}

/**
 * Record one successful analysis. Picks the right counter for the
 * tier — increment free, decrement paid credits, or just bump the
 * totals (Pro/Enterprise).
 *
 * Called after the analysis API has returned a successful response.
 * If this call fails we log + swallow — we'd rather over-count
 * occasionally than mis-charge a user.
 */
export async function recordAnalysisUsed(
  userId: string,
  tier: TierId,
): Promise<void> {
  if (!userId) return
  try {
    const admin = createAdminClient()
    if (tier === "free") {
      const { error } = await admin.rpc("increment_free_usage", { p_user_id: userId })
      if (error) console.warn("[usageGate] increment_free_usage failed:", error)
      return
    }
    if (tier === "pay_per_analysis") {
      const { error } = await admin.rpc("decrement_paid_credits", { p_user_id: userId })
      if (error) console.warn("[usageGate] decrement_paid_credits failed:", error)
      // Audit trail: surface this consumption on the user's Credit
      // History card (/account) and the admin Credits view.
      // event_type='analysis_used' + credit_delta=-1 is what the
      // Credit History row renderer keys off. Best-effort — log
      // failures don't propagate.
      try {
        await admin.from("payment_history").insert({
          user_id: userId,
          amount_gbp: 0,
          tier: "pay_per_analysis",
          status: "succeeded",
          description: "Analysis credit consumed",
          event_type: "analysis_used",
          credit_delta: -1,
        })
      } catch (e) {
        console.warn("[usageGate] payment_history audit row failed:", e)
      }
      return
    }
    // Pro / Enterprise — no quota, but still bump the totals counter
    // so the metrics view + per-user usage display reflects the run.
    // Reuse increment_free_usage because it increments BOTH
    // free_analyses_used and total_analyses_this_period; the free
    // counter is harmless for Pro since the gate ignores it for them.
    // (If you want totals-only without bumping free, add a dedicated
    // RPC; for now this is fine.)
    const { error } = await admin.rpc("increment_free_usage", { p_user_id: userId })
    if (error) console.warn("[usageGate] increment_free_usage (pro) failed:", error)
  } catch (e) {
    console.warn("[usageGate] recordAnalysisUsed threw:", e)
  }
}
