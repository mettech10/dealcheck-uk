/**
 * POST /api/discovery/dismiss — hide a result from future views.
 *
 * Body: { resultId, dismissed? }  (dismissed defaults to true; pass false
 * to undo). Ownership is verified through the parent search.
 */
import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/apiAuth"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  let body: { resultId?: string; dismissed?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const resultId = String(body.resultId ?? "")
  if (!resultId) {
    return NextResponse.json({ error: "resultId is required" }, { status: 400 })
  }
  const dismissed = body.dismissed !== false

  const admin = createAdminClient()

  // Verify the result belongs to a search this user owns.
  const { data: row } = await admin
    .from("discovery_results")
    .select("id, search_id")
    .eq("id", resultId)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: "Result not found" }, { status: 404 })

  const { data: search } = await admin
    .from("discovery_searches")
    .select("user_id")
    .eq("id", (row as unknown as { search_id: string }).search_id)
    .maybeSingle()

  if (!search || (search as unknown as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { error } = await admin
    .from("discovery_results")
    .update({
      dismissed_by_user: dismissed,
      status: dismissed ? "dismissed" : "screened",
    })
    .eq("id", resultId)

  if (error) {
    console.error("[discovery/dismiss] update failed:", error)
    return NextResponse.json({ error: "Could not update result" }, { status: 500 })
  }

  return NextResponse.json({ success: true, resultId, dismissed })
}
