/**
 * GET /api/admin/errors[?resolved=all|true|false][&type=…]
 *   → { errors: ErrorRow[], unresolvedCount }
 *
 * PATCH /api/admin/errors  body: { id, resolved: boolean }
 *   → { ok: true }  (idempotent; resolved_at is set/cleared)
 *
 * Both routes gated by ADMIN_EMAILS allow-list.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminEmail } from "@/lib/admin"

export const dynamic = "force-dynamic"

async function gate(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 })
  }
  return null
}

export async function GET(req: Request) {
  const denied = await gate()
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const resolvedParam = searchParams.get("resolved") ?? "all"
  const typeParam = searchParams.get("type") ?? "all"

  const admin = createAdminClient()
  let query = admin
    .from("admin_error_log")
    .select(
      "id, created_at, error_type, message, stack, user_id, endpoint, resolved, resolved_at",
    )
    .order("created_at", { ascending: false })
    .limit(500)
  if (resolvedParam === "true") query = query.eq("resolved", true)
  if (resolvedParam === "false") query = query.eq("resolved", false)
  if (typeParam !== "all") query = query.eq("error_type", typeParam)

  const { data: rows, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Unresolved count (for the sidebar badge) — single count(*) query
  // rather than re-reading the unresolved subset.
  const { count } = await admin
    .from("admin_error_log")
    .select("id", { count: "exact", head: true })
    .eq("resolved", false)

  return NextResponse.json({
    errors: rows ?? [],
    unresolvedCount: count ?? 0,
  })
}

export async function PATCH(req: Request) {
  const denied = await gate()
  if (denied) return denied

  let body: { id?: string; resolved?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    /* fall through */
  }
  if (!body.id || typeof body.resolved !== "boolean") {
    return NextResponse.json(
      { error: "id and resolved required" },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("admin_error_log")
    .update({
      resolved: body.resolved,
      resolved_at: body.resolved ? new Date().toISOString() : null,
    })
    .eq("id", body.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
