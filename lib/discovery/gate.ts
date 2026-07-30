/**
 * Deal Discovery gating (Section 8).
 *
 * Discovery is Pro-tier only — each run spends real Bright Data scraping
 * credits, so the gate is checked BEFORE any processing starts.
 *
 * Limits (Pro):
 *   • 5 discovery searches per calendar month
 *   • 3 postcode areas per search
 *   • 15 Tier 2 deep analyses per run (enforced in DiscoveryAgent)
 *
 * The monthly counter lives on user_usage.discovery_searches_used, keyed by
 * the same calendar-month period_start the free-analysis counter uses, so it
 * resets alongside the existing logic with no extra cron.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { checkCanAnalyse } from "@/lib/usageGate"

export const DISCOVERY_MONTHLY_LIMIT = 5
export const DISCOVERY_MAX_AREAS = 3
/** Tiers allowed to use Discovery at all. */
const ALLOWED_TIERS = new Set(["pro", "enterprise", "unlimited"])

export interface DiscoveryGateResult {
  allowed: boolean
  tier: string
  used: number
  limit: number
  /** Machine-readable refusal: 'tier' | 'limit' — null when allowed. */
  reason: "tier" | "limit" | null
  message: string | null
}

/** First day of the current calendar month, as a date string. */
export function currentPeriodStart(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`
}

/**
 * Can this user start a discovery search right now? Checks tier first, then
 * the monthly counter. Fails CLOSED on an unknown tier — discovery spends
 * money, so we don't fail open the way the read-only analyse gate does.
 */
export async function checkDiscoveryAccess(
  userId: string | null | undefined,
): Promise<DiscoveryGateResult> {
  if (!userId) {
    return {
      allowed: false,
      tier: "anonymous",
      used: 0,
      limit: DISCOVERY_MONTHLY_LIMIT,
      reason: "tier",
      message: "Please log in to use Deal Discovery.",
    }
  }

  const gate = await checkCanAnalyse(userId)
  const tier = (gate.tier ?? "free").toLowerCase()

  if (!ALLOWED_TIERS.has(tier)) {
    return {
      allowed: false,
      tier,
      used: 0,
      limit: DISCOVERY_MONTHLY_LIMIT,
      reason: "tier",
      message:
        "Deal Discovery is a Pro feature — it scans live listings and runs full analyses on the best candidates.",
    }
  }

  const used = await getDiscoveryUsage(userId)
  if (used >= DISCOVERY_MONTHLY_LIMIT) {
    return {
      allowed: false,
      tier,
      used,
      limit: DISCOVERY_MONTHLY_LIMIT,
      reason: "limit",
      message: `You've used all ${DISCOVERY_MONTHLY_LIMIT} discovery searches this month. Your allowance resets on the 1st.`,
    }
  }

  return {
    allowed: true,
    tier,
    used,
    limit: DISCOVERY_MONTHLY_LIMIT,
    reason: null,
    message: null,
  }
}

/** Searches used in the current calendar month (0 when no row yet). */
export async function getDiscoveryUsage(userId: string): Promise<number> {
  try {
    const { data } = await createAdminClient()
      .from("user_usage")
      .select("discovery_searches_used")
      .eq("user_id", userId)
      .eq("period_start", currentPeriodStart())
      .maybeSingle()
    const n = Number(
      (data as unknown as { discovery_searches_used?: number } | null)
        ?.discovery_searches_used ?? 0,
    )
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch (err) {
    console.warn("[discovery/gate] usage read failed:", err)
    // Unknown usage → treat as none used, but the tier check above still
    // blocks non-Pro users. A read blip shouldn't lock out a paying user.
    return 0
  }
}

/**
 * Increment the monthly counter. Called AFTER a search row is created so a
 * failed create doesn't burn an allowance.
 */
export async function recordDiscoveryUsed(userId: string): Promise<void> {
  const admin = createAdminClient()
  const period = currentPeriodStart()
  try {
    const current = await getDiscoveryUsage(userId)
    const { error } = await admin.from("user_usage").upsert(
      {
        user_id: userId,
        period_start: period,
        discovery_searches_used: current + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,period_start" },
    )
    if (error) console.warn("[discovery/gate] usage write failed:", error.message)
  } catch (err) {
    console.warn("[discovery/gate] usage write threw:", err)
  }
}
