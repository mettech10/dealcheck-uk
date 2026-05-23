import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkCanAnalyse } from "@/lib/usageGate"
import { permissionsForTier } from "@/lib/permissions"

/**
 * GET /api/payments/access[?analysisId=UUID]
 *
 * Returns the caller's per-analysis entitlement state in a single
 * call so the Save Deal / Export PDF buttons can render the right
 * label without scattering tier logic across components.
 *
 * Response shape:
 *   {
 *     tier:              TierId,
 *     authenticated:     boolean,
 *     canExportPDF:      boolean,  // Pro/Ent OR has bound credit for this analysis
 *     canSaveDeals:      boolean,  // Pro/Ent OR has at least one floating credit
 *     hasBoundCredit:    boolean,  // payment_history row exists for (user, analysisId)
 *     floatingCredits:   number,   // PPA credits not yet bound to any analysis
 *   }
 *
 * analysisId is optional — when omitted, hasBoundCredit is false and
 * canExportPDF reflects only the tier-level entitlement.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const analysisIdRaw = (searchParams.get("analysisId") || "").trim()
  const analysisId = UUID_RE.test(analysisIdRaw) ? analysisIdRaw : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const perms = permissionsForTier("free")
    return NextResponse.json({
      tier: perms.tier,
      authenticated: false,
      canExportPDF: false,
      canSaveDeals: false,
      hasBoundCredit: false,
      floatingCredits: 0,
    })
  }

  const state = await checkCanAnalyse(user.id)
  const perms = permissionsForTier(state.tier)
  const proOrHigher = state.tier === "pro" || state.tier === "enterprise"

  // Pro/Enterprise short-circuit — they unlock everything.
  if (proOrHigher) {
    return NextResponse.json({
      tier: state.tier,
      authenticated: true,
      canExportPDF: true,
      canSaveDeals: true,
      hasBoundCredit: false,
      floatingCredits: 0,
    })
  }

  const admin = createAdminClient()

  // Bound-credit lookup (per-analysis PDF unlock).
  let hasBoundCredit = false
  if (analysisId) {
    const { data, error } = await admin
      .from("payment_history")
      .select("id")
      .eq("user_id", user.id)
      .eq("analysis_id", analysisId)
      .eq("tier", "pay_per_analysis")
      .eq("status", "succeeded")
      .limit(1)
    if (error) {
      console.warn("[access] bound-credit lookup failed:", error)
    }
    hasBoundCredit = Array.isArray(data) && data.length > 0
  }

  // Floating-credit count (drives the "Use 1 credit to unlock" affordance).
  let floatingCredits = 0
  {
    const { data, error } = await admin
      .from("user_floating_credits")
      .select("floating_credits")
      .eq("user_id", user.id)
      .maybeSingle()
    if (error) {
      console.warn("[access] floating-credit lookup failed:", error)
    } else if (data?.floating_credits) {
      floatingCredits = data.floating_credits
    }
  }

  const canExportPDF = perms.canExportPDF || hasBoundCredit
  // Save: tier already allows it (PPA), OR a floating credit is available
  // for a Free user to spend on this save.
  const canSaveDeals = perms.canSaveDeals || floatingCredits > 0

  return NextResponse.json({
    tier: state.tier,
    authenticated: true,
    canExportPDF,
    canSaveDeals,
    hasBoundCredit,
    floatingCredits,
  })
}
