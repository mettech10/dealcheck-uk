/**
 * Single source of truth for tier-based feature gating.
 *
 * Every component that needs to know "can this user do X?" reads from
 * `getUserPermissions(userId)` (server-side) or
 * `permissionsForTier(tierId)` (client-side, when the tier is already
 * known via /api/usage).
 *
 * Why this exists:
 *   Before May 2026 the same checks were scattered across the analyse
 *   page, compare page, portfolio page, PDF button, save flow — each
 *   coded against TIERS_BY_ID[tier].unlocks directly. Adding a new
 *   rule meant grep-and-pray. This helper collapses every gate into
 *   one shape so callers can't drift apart.
 *
 * Per-analysis PDF check:
 *   PAY_PER_ANALYSIS users get PDF export for the specific analysis
 *   they paid for, not for every analysis. canExportPDFForAnalysis()
 *   wraps a payment_history lookup keyed on (userId, analysisId).
 *   The static UserPermissions.canExportPDF flag is conservatively
 *   `false` for PPA — components that have an analysisId should call
 *   the per-analysis helper to get the right answer.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { checkCanAnalyse } from "@/lib/usageGate"
import { TIERS_BY_ID, type TierId } from "@/lib/tiers"

export type StrategyAllowance = "all" | TierId[]

export interface UserPermissions {
  tier: TierId
  /** "all" when every strategy is unlocked (current rule for every tier),
   *  or an explicit allow-list. Kept as a union so future per-tier
   *  restrictions don't break callers. */
  strategiesAllowed: "all" | ReadonlyArray<
    "btl" | "hmo" | "brr" | "flip" | "r2sa" | "development"
  >
  analysesPerMonth: number | "unlimited"
  /** Static PDF entitlement. For Pay Per Analysis this is FALSE — the
   *  per-analysis check lives in `canExportPDFForAnalysis`. */
  canExportPDF: boolean
  canSaveDeals: boolean
  savedDealsLimit: number | "unlimited"
  portfolioLimit: number | "unlimited"
  compareDealsLimit: number
  compareDealsCanExportPDF: boolean
}

const STRATEGY_COUNT = 6

/** Pure function — no I/O. Use when you already know the tier id. */
export function permissionsForTier(tierId: TierId): UserPermissions {
  const tier = TIERS_BY_ID[tierId] ?? TIERS_BY_ID.free
  const allStrategies = tier.strategies.length === STRATEGY_COUNT

  if (tierId === "pro" || tierId === "enterprise") {
    return {
      tier: tierId,
      strategiesAllowed: allStrategies ? "all" : tier.strategies,
      analysesPerMonth: "unlimited",
      canExportPDF: true,
      canSaveDeals: true,
      savedDealsLimit: "unlimited",
      portfolioLimit: "unlimited",
      compareDealsLimit: 3,
      compareDealsCanExportPDF: true,
    }
  }

  if (tierId === "pay_per_analysis") {
    return {
      tier: "pay_per_analysis",
      strategiesAllowed: allStrategies ? "all" : tier.strategies,
      analysesPerMonth: "unlimited", // one-off purchases, no monthly cap
      canExportPDF: false, // resolved per analysis id via canExportPDFForAnalysis
      canSaveDeals: true,
      savedDealsLimit: 1,
      portfolioLimit: 3,
      compareDealsLimit: 3,
      compareDealsCanExportPDF: false,
    }
  }

  // free (default)
  return {
    tier: "free",
    strategiesAllowed: allStrategies ? "all" : tier.strategies,
    analysesPerMonth: tier.freeAnalysesPerMonth ?? 3,
    canExportPDF: false,
    canSaveDeals: false,
    savedDealsLimit: 0,
    portfolioLimit: 3,
    compareDealsLimit: 2,
    compareDealsCanExportPDF: false,
  }
}

/**
 * Server-side: resolve a user id → full permission set.
 *
 * Falls through to the Free permission set for unauthenticated users
 * (mirrors checkCanAnalyse's anonymous behaviour). RPC errors also fall
 * through to Free — fail closed for paywall safety.
 */
export async function getUserPermissions(
  userId: string | null | undefined,
): Promise<UserPermissions> {
  if (!userId) return permissionsForTier("free")
  const state = await checkCanAnalyse(userId)
  return permissionsForTier(state.tier)
}

/**
 * Per-analysis PDF check for Pay Per Analysis users.
 *
 * Returns true if:
 *   - the user has an active Pro/Enterprise subscription, OR
 *   - the user has a successful payment in payment_history for this
 *     specific analysis id (PAY_PER_ANALYSIS tier).
 *
 * Free users always get false. The payment_history table is the
 * authoritative source for per-deal entitlements (see
 * supabase/migrations/20260515_payments_and_usage.sql).
 */
export async function canExportPDFForAnalysis(
  userId: string | null | undefined,
  analysisId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false

  const perms = await getUserPermissions(userId)
  if (perms.canExportPDF) return true // pro / enterprise
  if (perms.tier !== "pay_per_analysis") return false
  if (!analysisId) return false

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("payment_history")
      .select("id")
      .eq("user_id", userId)
      .eq("analysis_id", analysisId)
      .eq("status", "succeeded")
      .limit(1)
    if (error) {
      console.warn("[permissions] payment_history lookup failed:", error)
      return false
    }
    return Array.isArray(data) && data.length > 0
  } catch (e) {
    console.warn("[permissions] payment_history threw:", e)
    return false
  }
}
