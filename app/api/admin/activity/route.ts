/**
 * GET /api/admin/activity[?type=…&limit=100]
 *
 * Returns the tail of admin_activity_log for the live feed. Admin-
 * gated. Default page size 100, max 500 — the live UI polls every
 * 30s so the recent slice is the only relevant view.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminEmail } from "@/lib/admin"

export const dynamic = "force-dynamic"

const ALLOWED_TYPES = new Set([
  "all",
  "signup",
  "analysis",
  "payment",
  "login",
  "pdf_export",
  "saved_deal",
])

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const typeParam = searchParams.get("type") ?? "all"
  const limitParam = Number(searchParams.get("limit") ?? "100")
  const limit = Math.min(Math.max(1, limitParam || 100), 500)
  const type = ALLOWED_TYPES.has(typeParam) ? typeParam : "all"

  const admin = createAdminClient()
  let query = admin
    .from("admin_activity_log")
    .select(
      "id, created_at, event_type, user_id, user_email, metadata, ip_address",
    )
    .order("created_at", { ascending: false })
    .limit(limit)
  if (type !== "all") query = query.eq("event_type", type)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ events: data ?? [] })
}
