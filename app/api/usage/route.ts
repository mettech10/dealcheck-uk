import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { checkCanAnalyse } from "@/lib/usageGate"

/**
 * GET /api/usage
 *
 * Returns the current authenticated user's tier + usage state. Used by:
 *   - components/UpgradeModal.tsx (to decide which paywall message to show)
 *   - components/analyse/property-form.tsx (proactively hide / lock the
 *     submit button if quota exhausted, without waiting for a 403)
 *   - app/account/page.tsx (Section 6 — current plan + usage stats)
 *
 * 200 for anyone (anonymous = free tier with 0 used). 5xx only on RPC
 * errors. We never return 401 from this route — the client decides what
 * to do based on tier.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const state = await checkCanAnalyse(user?.id)
  return NextResponse.json({
    authenticated: !!user,
    ...state,
  })
}
