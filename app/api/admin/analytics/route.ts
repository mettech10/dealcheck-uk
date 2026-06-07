/**
 * GET /api/admin/analytics?range=today|7d|30d|all
 *
 * Returns four pre-aggregated series for the dashboard charts:
 *   1. analysesOverTime   — [{ date, count }]
 *   2. strategyBreakdown  — [{ strategy, count }]
 *   3. revenueOverTime    — [{ week, amount }]
 *   4. userGrowth         — [{ week, cumulative }]
 *
 * Aggregations are computed in JS over a single batched read of each
 * source table. Cheap enough for the current data volume; revisit if
 * any series passes ~10k rows.
 *
 * Strategy data is read from saved_analyses.investment_type (the
 * authoritative per-deal record) rather than user_usage, which only
 * stores per-period counters with no strategy column. If the user
 * never saved a deal the strategy series is empty — accept it; the
 * charts show "no data" cleanly.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminEmail } from "@/lib/admin"

export const dynamic = "force-dynamic"

type RangeKey = "today" | "7d" | "30d" | "all"

interface AnalyticsPayload {
  range: RangeKey
  analysesOverTime: Array<{ date: string; count: number }>
  strategyBreakdown: Array<{ strategy: string; count: number }>
  revenueOverTime: Array<{ week: string; amount: number }>
  userGrowth: Array<{ week: string; cumulative: number }>
}

const STRATEGY_LABELS: Record<string, string> = {
  btl: "BTL",
  hmo: "HMO",
  brr: "BRRRR",
  flip: "Flip",
  r2sa: "SA",
  development: "Development",
}

function rangeStartIso(range: RangeKey): string | null {
  if (range === "all") return null
  const now = new Date()
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  }
  const days = range === "7d" ? 7 : 30
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

/** YYYY-MM-DD in UTC — stable across timezones for chart keys. */
function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

/** YYYY-Www — ISO week. Cheap implementation: use the Monday of the week. */
function weekKey(iso: string): string {
  const d = new Date(iso)
  const dow = (d.getUTCDay() + 6) % 7 // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const rangeRaw = searchParams.get("range") ?? "7d"
  const range: RangeKey = (
    ["today", "7d", "30d", "all"] as const
  ).includes(rangeRaw as RangeKey)
    ? (rangeRaw as RangeKey)
    : "7d"
  const since = rangeStartIso(range)

  const admin = createAdminClient()

  // ── Pull source data in parallel ───────────────────────────────────
  const usageQuery = admin
    .from("user_usage")
    .select("period_start, total_analyses_this_period, updated_at")
  const paymentsQuery = admin
    .from("payment_history")
    .select("amount_gbp, status, created_at")
    .eq("status", "succeeded")
  const savedQuery = admin
    .from("saved_analyses")
    .select("investment_type, created_at")

  if (since) {
    usageQuery.gte("updated_at", since)
    paymentsQuery.gte("created_at", since)
    savedQuery.gte("created_at", since)
  }

  const [usersRes, usageRes, paymentsRes, savedRes] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    usageQuery,
    paymentsQuery,
    savedQuery,
  ])

  // ── 1. Analyses over time (daily) ──────────────────────────────────
  // user_usage stores monthly totals — for a daily series we
  // approximate with the row's updated_at timestamp; each touch
  // counts as a day with activity. Not per-event accurate, but good
  // enough until admin_activity_log lands.
  const analysesByDay: Record<string, number> = {}
  for (const row of usageRes.data ?? []) {
    const r = row as {
      period_start: string
      total_analyses_this_period: number | null
      updated_at: string
    }
    const day = dayKey(r.updated_at)
    analysesByDay[day] = (analysesByDay[day] ?? 0) + (r.total_analyses_this_period ?? 0)
  }
  const analysesOverTime = Object.entries(analysesByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  // ── 2. Strategy breakdown ──────────────────────────────────────────
  const strategyCounts: Record<string, number> = {}
  for (const row of savedRes.data ?? []) {
    const r = row as { investment_type: string | null }
    const strat = (r.investment_type ?? "btl").toLowerCase()
    strategyCounts[strat] = (strategyCounts[strat] ?? 0) + 1
  }
  const strategyBreakdown = Object.entries(strategyCounts)
    .map(([strategy, count]) => ({
      strategy: STRATEGY_LABELS[strategy] ?? strategy,
      count,
    }))
    .sort((a, b) => b.count - a.count)

  // ── 3. Revenue over time (weekly) ──────────────────────────────────
  const revByWeek: Record<string, number> = {}
  for (const row of paymentsRes.data ?? []) {
    const r = row as { amount_gbp: number | null; created_at: string }
    const wk = weekKey(r.created_at)
    revByWeek[wk] = (revByWeek[wk] ?? 0) + Number(r.amount_gbp ?? 0)
  }
  const revenueOverTime = Object.entries(revByWeek)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, amount]) => ({
      week,
      amount: Number(amount.toFixed(2)),
    }))

  // ── 4. User growth (weekly cumulative) ─────────────────────────────
  const users = usersRes.data?.users ?? []
  const sortedByCreated = [...users].sort(
    (a, b) =>
      new Date(a.created_at ?? "").getTime() -
      new Date(b.created_at ?? "").getTime(),
  )

  const cutoff = since ? new Date(since).getTime() : 0
  const signupsPerWeek: Record<string, number> = {}
  // Baseline = users who already existed BEFORE the range start.
  let baseline = 0
  for (const u of sortedByCreated) {
    const t = new Date(u.created_at ?? "").getTime()
    if (t < cutoff) {
      baseline += 1
      continue
    }
    const wk = weekKey(u.created_at ?? new Date().toISOString())
    signupsPerWeek[wk] = (signupsPerWeek[wk] ?? 0) + 1
  }
  let running = baseline
  const userGrowth = Object.entries(signupsPerWeek)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, count]) => {
      running += count
      return { week, cumulative: running }
    })
  // If the range covers everything and there were no weekly buckets
  // (very new project), surface a single point with current total
  // so the chart isn't empty.
  if (userGrowth.length === 0 && users.length > 0) {
    userGrowth.push({
      week: weekKey(new Date().toISOString()),
      cumulative: users.length,
    })
  }

  const payload: AnalyticsPayload = {
    range,
    analysesOverTime,
    strategyBreakdown,
    revenueOverTime,
    userGrowth,
  }
  return NextResponse.json(payload)
}
