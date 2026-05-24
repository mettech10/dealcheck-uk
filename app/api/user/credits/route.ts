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
  const { data, error } = await admin.rpc("get_user_credit_state", {
    p_user_id: user.id,
  })
  if (error) {
    console.warn("[/api/user/credits] RPC failed:", error)
  }
  const row = (Array.isArray(data) ? data[0] : data) as CreditStateRow | null

  const tier = (row?.tier as TierId) ?? "free"
  const isUnlimited = !!row?.is_unlimited
  const creditBalance = row?.credit_balance ?? 0
  const freeUsed = row?.free_analyses_used ?? 0
  const freeLimit = row?.free_limit ?? FREE_MONTHLY_CAP

  return NextResponse.json({
    authenticated: true,
    tier,
    isUnlimited,
    unlimitedUntil: row?.unlimited_until ?? null,
    creditBalance,
    totalPurchased: row?.total_credits_purchased ?? 0,
    totalUsed: row?.total_credits_used ?? 0,
    freeUsed,
    freeLimit,
    canAnalyse:
      isUnlimited || creditBalance > 0 || freeUsed < freeLimit,
  })
}
