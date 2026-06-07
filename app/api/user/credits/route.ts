/**
 * GET /api/user/credits
 *
 * Returns the signed-in user's credit state in one payload — shape
 * matches what the nav pill (Stage D) and the analyse-form pre-check
 * (Stage F) need. Backed by the get_user_credit_state RPC so the
 * join logic isn't duplicated across server and client.
 *
 * Response:
 *   {
 *     authenticated:           boolean,
 *     tier:                    TierId,
 *     isUnlimited:             boolean,
 *     unlimitedUntil:          ISO string | null,
 *     creditBalance:           number,
 *     totalPurchased:          number,
 *     totalUsed:               number,
 *     freeUsed:                number,
 *     freeLimit:               number,
 *     canAnalyse:              boolean,   // derived: isUnlimited || credits>0 || freeUsed<freeLimit
 *   }
 *
 * Anonymous calls get a coherent "free tier, no usage" shape so the
 * nav pill renders sensibly for logged-out visitors.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { FREE_MONTHLY_CAP, type TierId } from "@/lib/tiers"
import { deriveCanAnalyse } from "@/lib/usageGate"

export const dynamic = "force-dynamic"

interface CreditStateRow {
  tier: string | null
  status: string | null
  is_unlimited: boolean | null
  unlimited_until: string | null
  credit_balance: number | null
  total_credits_purchased: number | null
  total_credits_used: number | null
  free_analyses_used: number | null
  free_limit: number | null
  last_topped_up_at: string | null
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({
      authenticated: false,
      tier: "free" as TierId,
      isUnlimited: false,
      unlimitedUntil: null,
      creditBalance: 0,
      totalPurchased: 0,
      totalUsed: 0,
      freeUsed: 0,
      freeLimit: FREE_MONTHLY_CAP,
      canAnalyse: false,
    })
  }

  const admin = createAdminClient()

  // Try the new RPC first (post-migration). If it's missing (pre-
  // migration deployment, or the RPC was removed), fall back to
  // reading user_subscriptions + user_usage directly so the endpoint
  // STILL returns a coherent shape — no 500, no broken gate.
  let tier: TierId = "free"
  let isUnlimited = false
  let unlimitedUntil: string | null = null
  let creditBalance = 0
  let totalPurchased = 0
  let totalUsed = 0
  let freeUsed = 0
  const freeLimit = FREE_MONTHLY_CAP

  try {
    const { data, error } = await admin.rpc("get_user_credit_state", {
      p_user_id: user.id,
    })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as CreditStateRow | null
    if (row) {
      tier = (row.tier as TierId) ?? "free"
      isUnlimited = !!row.is_unlimited
      unlimitedUntil = row.unlimited_until ?? null
      creditBalance = row.credit_balance ?? 0
      totalPurchased = row.total_credits_purchased ?? 0
      totalUsed = row.total_credits_used ?? 0
      freeUsed = row.free_analyses_used ?? 0
    }
  } catch (e) {
    // RPC unavailable (migration not yet applied) — degrade
    // gracefully via direct table reads.
    console.warn("[/api/user/credits] RPC unavailable, using fallback:", e)
    const [{ data: sub }, { data: usage }] = await Promise.all([
      admin
        .from("user_subscriptions")
        .select("tier, status, current_period_end")
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("user_usage")
        .select("paid_analysis_credits, free_analyses_used, period_start")
        .eq("user_id", user.id)
        .order("period_start", { ascending: false })
        .limit(12),
    ])
    tier = (sub?.tier as TierId) ?? "free"
    const status = sub?.status ?? "active"
    isUnlimited =
      (tier === "pro" || tier === "enterprise") && status === "active"
    unlimitedUntil = sub?.current_period_end ?? null
    const currentMonth = new Date().toISOString().slice(0, 7)
    const currentUsage = (usage ?? []).find((u) =>
      (u as { period_start: string }).period_start.startsWith(currentMonth),
    ) as { paid_analysis_credits?: number; free_analyses_used?: number } | undefined
    creditBalance = currentUsage?.paid_analysis_credits ?? 0
    freeUsed = currentUsage?.free_analyses_used ?? 0
  }

  return NextResponse.json({
    authenticated: true,
    tier,
    isUnlimited,
    unlimitedUntil,
    creditBalance,
    totalPurchased,
    totalUsed,
    freeUsed,
    freeLimit,
    canAnalyse: deriveCanAnalyse({
      isUnlimited,
      creditBalance,
      freeUsed,
      freeLimit,
    }),
  })
}
