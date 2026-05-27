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
export type CreditTypeUsed = "pro" | "credit" | "free"

/** What recordAnalysisUsed returns to the caller. newCreditBalance
 *  is the AUTHORITATIVE post-deduction balance — the analyse route
 *  echoes it back in its response so the frontend's navbar pill
 *  can apply it directly without a /api/user/credits refetch race
 *  (P1 fix, 2026-05-26).
 *
 *  Set to null for the free + pro paths because the paid pool
 *  wasn't touched on those runs — the caller already has the value.
 */
export interface AnalysisUsageResult {
  creditType: CreditTypeUsed
  newCreditBalance: number | null
}

/**
 * Record one successful analysis. Returns which type of credit was
 * actually consumed PLUS (when a paid credit was spent) the new
 * balance after deduction, so the analyse route's 201 response is
 * the single source of truth — no read-after-write window.
 *
 * Priority order (changed 2026-05-25):
 *   1. Pro / Enterprise → no deduction, bump totals only
 *   2. Paid credit > 0  → deduct 1 paid credit (regardless of tier
 *                          label — admin grants previously left tier
 *                          as 'free' but the credit should still be
 *                          spent first)
 *   3. Otherwise         → free counter
 *
 * If this call fails we log + swallow — we'd rather over-count
 * occasionally than mis-charge a user.
 */
export async function recordAnalysisUsed(
  userId: string,
  tier: TierId,
): Promise<AnalysisUsageResult> {
  if (!userId) return { creditType: "free", newCreditBalance: null }

  try {
    const admin = createAdminClient()

    // 1. Pro / Enterprise → unlimited. Just bump the totals so
    //    /admin metrics reflect the run. Free counter rises but
    //    the gate ignores it for these tiers.
    if (tier === "pro" || tier === "enterprise") {
      const { error } = await admin.rpc("increment_free_usage", { p_user_id: userId })
      if (error) console.warn("[usageGate] increment_free_usage (pro) failed:", error)
      return { creditType: "pro", newCreditBalance: null }
    }

    // 2. Paid credit > 0 → spend it first, regardless of tier.
    //    deduct_one_credit raises 'insufficient_credits' if balance
    //    is already 0; we catch that and fall through to free.
    //    The RPC returns the post-deduction balance as an integer,
    //    which we plumb back to the caller.
    try {
      const { data, error } = await admin.rpc("deduct_one_credit", {
        p_user_id: userId,
      })
      if (error) {
        // PostgREST surfaces our P0001 RAISE here. Treat as
        // "no paid credit" and fall through.
        if (!String(error.message ?? "").includes("insufficient_credits")) {
          console.warn("[usageGate] deduct_one_credit failed:", error)
        }
      } else {
        // Paid credit was spent — log the audit row.
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
        const newBalance =
          typeof data === "number"
            ? data
            : typeof data === "string"
              ? Number(data)
              : 0
        return {
          creditType: "credit",
          newCreditBalance: Number.isFinite(newBalance) ? newBalance : 0,
        }
      }
    } catch (e) {
      console.warn("[usageGate] deduct_one_credit threw:", e)
    }

    // 3. Free counter — last resort. Caller already verified
    //    free_used < free_limit via checkCanAnalyse.
    const { error } = await admin.rpc("increment_free_usage", { p_user_id: userId })
    if (error) console.warn("[usageGate] increment_free_usage failed:", error)
    return { creditType: "free", newCreditBalance: null }
  } catch (e) {
    console.warn("[usageGate] recordAnalysisUsed threw:", e)
    return { creditType: "free", newCreditBalance: null }
  }
}
