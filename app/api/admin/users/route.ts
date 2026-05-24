/**
 * GET /api/admin/users
 *
 * Returns every Supabase auth user, decorated with their current tier
 * (user_subscriptions) and analyses-this-month + total-analyses
 * (aggregated from user_usage). One JSON payload, consumed by the
 * Users page client component.
 *
 * Auth: gated by the admin allow-list. The proxy.ts edge gate
 * already covers /admin/* page routes, but API routes need their
 * own check — repeated here against ADMIN_EMAILS.
 *
 * Returns 401 to non-admins; the page won't render this fetch anyway
 * (it's only mounted inside the layout, which itself is gated), but
 * keep the route defensible in case of direct calls.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminEmail } from "@/lib/admin"

export const dynamic = "force-dynamic"

interface ApiUserRow {
  id: string
  email: string
  tier: string
  analysesThisMonth: number
  totalAnalyses: number
  joined: string
  lastSignInAt: string | null
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 })
  }

  const admin = createAdminClient()

  // Pull all users in one batch. perPage cap is 1000 — if we ever
  // grow beyond that, paginate here.
  const usersRes = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const users = usersRes.data?.users ?? []

  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  )
    .toISOString()
    .slice(0, 10) // user_usage.period_start is DATE not TIMESTAMP

  const [subsRes, usageRes] = await Promise.all([
    admin.from("user_subscriptions").select("user_id, tier"),
    admin
      .from("user_usage")
      .select("user_id, period_start, total_analyses_this_period"),
  ])

  const tierByUser: Record<string, string> = {}
  for (const row of subsRes.data ?? []) {
    const r = row as { user_id: string; tier: string }
    tierByUser[r.user_id] = r.tier
  }

  const analysesThisMonth: Record<string, number> = {}
  const analysesAllTime: Record<string, number> = {}
  for (const row of usageRes.data ?? []) {
    const r = row as {
      user_id: string
      period_start: string
      total_analyses_this_period: number | null
    }
    const n = r.total_analyses_this_period ?? 0
    analysesAllTime[r.user_id] = (analysesAllTime[r.user_id] ?? 0) + n
    if (r.period_start === startOfMonth) {
      analysesThisMonth[r.user_id] = (analysesThisMonth[r.user_id] ?? 0) + n
    }
  }

  const result: ApiUserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email ?? "",
    tier: tierByUser[u.id] ?? "free",
    analysesThisMonth: analysesThisMonth[u.id] ?? 0,
    totalAnalyses: analysesAllTime[u.id] ?? 0,
    joined: u.created_at ?? new Date().toISOString(),
    lastSignInAt: u.last_sign_in_at ?? null,
  }))

  return NextResponse.json({ users: result })
}
