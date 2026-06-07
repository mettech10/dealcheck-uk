import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/payments/consume-credit
 *
 * Body: { analysisId: UUID }
 *
 * Binds one floating Pay-Per-Analysis credit to a specific saved
 * analysis. Called by the Save Deal / Export PDF buttons when the
 * user has a credit but it hasn't yet been spent.
 *
 * Idempotent — if the analysis already has a bound PPA credit for
 * this user, the underlying RPC returns true without consuming
 * another credit. Safe to call as a guard before showing the unlock
 * state in the UI.
 *
 * Responses:
 *   200 { success: true,  bound: true  }  — credit bound (or already bound)
 *   402 { success: false, error: "no_credit" } — no floating credit available
 *   401 { success: false, error: "not_authenticated" }
 *   400 { success: false, error: "bad_analysisId" }
 *   500 { success: false, error: "<rpc error>" }
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  // Auth — must be the credit owner.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { success: false, error: "not_authenticated" },
      { status: 401 },
    )
  }

  let body: { analysisId?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* fall through */
  }
  const analysisId = (body.analysisId || "").trim()
  if (!UUID_RE.test(analysisId)) {
    return NextResponse.json(
      { success: false, error: "bad_analysisId" },
      { status: 400 },
    )
  }

  // Ownership guard — caller must own the saved analysis they're
  // binding the credit to. Without this, a malicious user could
  // burn one of their own credits on someone else's deal id (low
  // impact but trivially preventable).
  const admin = createAdminClient()
  const { data: owned, error: ownedErr } = await admin
    .from("saved_analyses")
    .select("id")
    .eq("id", analysisId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (ownedErr) {
    console.warn("[consume-credit] saved_analyses ownership check failed:", ownedErr)
  }
  if (!owned) {
    return NextResponse.json(
      { success: false, error: "analysis_not_found" },
      { status: 404 },
    )
  }

  const { data, error } = await admin.rpc("consume_ppa_credit_for_analysis", {
    p_user_id: user.id,
    p_analysis_id: analysisId,
  })

  if (error) {
    console.error("[consume-credit] RPC failed:", error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    )
  }

  const bound = data === true
  if (!bound) {
    return NextResponse.json(
      { success: false, error: "no_credit" },
      { status: 402 },
    )
  }

  return NextResponse.json({ success: true, bound: true })
}
