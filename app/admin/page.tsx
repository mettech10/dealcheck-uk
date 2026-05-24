/**
 * /admin — Overview metrics dashboard.
 *
 * Pure server component. Pulls four headline stats + two short tables
 * + a placeholder activity feed all in parallel. Reads via the
 * service-role admin client so RLS doesn't apply (the layout already
 * gated the request to an admin email).
 *
 * Data sources for this stage:
 *   - Total users     → auth.admin.listUsers().data.total (via SDK)
 *   - Analyses Run    → user_usage.total_analyses_this_period (sum)
 *   - Revenue (MTD)   → payment_history.amount_gbp where succeeded,
 *                       current calendar month
 *   - Errors          → "—" until stage 5 adds admin_error_log
 *
 * Recent signups + recent payments fetched directly. Activity feed
 * shows a holding card until stage 6 lands.
 */

import {
  Users,
  BarChart3,
  PoundSterling,
  AlertTriangle,
} from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { StatCard } from "@/components/admin/stat-card"
import { TierBadge } from "@/components/admin/tier-badge"
import { TypeBadge } from "@/components/admin/type-badge"
import { formatRelativeTime } from "@/lib/admin-format"

export const dynamic = "force-dynamic"
export const revalidate = 0

interface UserRow {
  id: string
  email: string
  created_at: string
}

interface OverviewData {
  totalUsers: number
  signupsThisWeek: number
  totalAnalysesAllTime: number
  totalAnalysesToday: number
  revenueThisMonthGbp: number
  errorsLast24h: number | null
  recentSignups: Array<{
    email: string
    created_at: string
    tier: string
    analysesThisMonth: number
  }>
  recentPayments: Array<{
    email: string
    amount_gbp: number
    tier: string
    created_at: string
  }>
  recentActivity: Array<{
    id: string
    event_type: string
    user_email: string | null
    created_at: string
  }>
}

async function loadOverview(): Promise<OverviewData> {
  const admin = createAdminClient()

  // Pull the first batch of users so we can derive total + recent-10
  // + signups-this-week in one round trip. perPage capped at 1000 by
  // Supabase; if you ever exceed that, switch to pagination.
  const usersRes = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const allUsers: UserRow[] = (usersRes.data?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? "",
    created_at: u.created_at ?? new Date().toISOString(),
  }))
  const totalUsers = usersRes.data?.total ?? allUsers.length

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const signupsThisWeek = allUsers.filter(
    (u) => new Date(u.created_at).getTime() >= oneWeekAgo,
  ).length

  // Most recent 10 signups (auth.admin.listUsers returns newest first
  // by default but we sort defensively in case the SDK changes).
  const recent10Users = [...allUsers]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 10)

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10) // YYYY-MM-DD — matches user_usage.period_start type
  const startOfMonthIso = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).toISOString()
  const startOfTodayIso = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString()

  // ── Aggregate analyses (all time + today via updated_at) ─────────
  const usageRes = await admin
    .from("user_usage")
    .select("user_id, period_start, total_analyses_this_period, updated_at")
  const usageRows: Array<{
    user_id: string
    period_start: string
    total_analyses_this_period: number | null
    updated_at: string
  }> = usageRes.data ?? []
  const totalAnalysesAllTime = usageRows.reduce(
    (s, r) => s + (r.total_analyses_this_period ?? 0),
    0,
  )
  // "Today" approximation: count rows updated today this month — close
  // enough until admin_activity_log gives us per-event timestamps.
  const totalAnalysesToday = usageRows.filter(
    (r) => r.updated_at >= startOfTodayIso,
  ).length

  // Per-user analyses this month (for the signups table)
  const usageByUserThisMonth: Record<string, number> = {}
  for (const r of usageRows) {
    if (r.period_start === startOfMonth) {
      usageByUserThisMonth[r.user_id] =
        (usageByUserThisMonth[r.user_id] ?? 0) + (r.total_analyses_this_period ?? 0)
    }
  }

  // ── Revenue MTD ──────────────────────────────────────────────────
  const paymentsMtdRes = await admin
    .from("payment_history")
    .select("amount_gbp")
    .eq("status", "succeeded")
    .gte("created_at", startOfMonthIso)
  const revenueThisMonthGbp = (paymentsMtdRes.data ?? []).reduce(
    (s: number, r: { amount_gbp: number | null }) =>
      s + Number(r.amount_gbp ?? 0),
    0,
  )

  // ── Errors last 24h (admin_error_log) ────────────────────────────
  // Fail-soft: missing table (pre-migration) just leaves the count
  // null so the card renders "—" rather than 500-ing.
  let errorsLast24h: number | null = null
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await admin
      .from("admin_error_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24h)
    errorsLast24h = count ?? 0
  } catch {
    errorsLast24h = null
  }

  // ── Tier lookup for signups table ────────────────────────────────
  const subsRes = await admin
    .from("user_subscriptions")
    .select("user_id, tier")
  const tierByUser: Record<string, string> = {}
  for (const row of subsRes.data ?? []) {
    tierByUser[(row as { user_id: string }).user_id] = (row as { tier: string }).tier
  }

  const recentSignups: OverviewData["recentSignups"] = recent10Users.map((u) => ({
    email: u.email,
    created_at: u.created_at,
    tier: tierByUser[u.id] ?? "free",
    analysesThisMonth: usageByUserThisMonth[u.id] ?? 0,
  }))

  // ── Recent payments ──────────────────────────────────────────────
  const recentPaymentsRes = await admin
    .from("payment_history")
    .select("user_id, amount_gbp, tier, created_at")
    .order("created_at", { ascending: false })
    .limit(10)
  const emailByUser: Record<string, string> = {}
  for (const u of allUsers) emailByUser[u.id] = u.email
  const recentPayments: OverviewData["recentPayments"] = (
    recentPaymentsRes.data ?? []
  ).map((p) => {
    const row = p as {
      user_id: string
      amount_gbp: number | null
      tier: string | null
      created_at: string
    }
    return {
      email: emailByUser[row.user_id] ?? "(unknown user)",
      amount_gbp: Number(row.amount_gbp ?? 0),
      tier: row.tier ?? "pay_per_analysis",
      created_at: row.created_at,
    }
  })

  // ── Recent activity (last 20) ────────────────────────────────────
  let recentActivity: OverviewData["recentActivity"] = []
  try {
    const recentActRes = await admin
      .from("admin_activity_log")
      .select("id, event_type, user_email, created_at")
      .order("created_at", { ascending: false })
      .limit(20)
    recentActivity = (recentActRes.data ?? []).map((row) => {
      const r = row as {
        id: string
        event_type: string
        user_email: string | null
        created_at: string
      }
      return {
        id: r.id,
        event_type: r.event_type,
        user_email: r.user_email,
        created_at: r.created_at,
      }
    })
  } catch {
    /* table not yet created — leave list empty */
  }

  return {
    totalUsers,
    signupsThisWeek,
    totalAnalysesAllTime,
    totalAnalysesToday,
    revenueThisMonthGbp,
    errorsLast24h,
    recentSignups,
    recentPayments,
    recentActivity,
  }
}

export default async function AdminOverviewPage() {
  const data = await loadOverview()

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Overview</h1>
        <p className="mt-1 text-sm text-[#9CA3AF]">
          Snapshot of platform activity.
        </p>
      </header>

      {/* ── Stat cards ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Total Users"
          value={data.totalUsers.toLocaleString()}
          sublabel={`+${data.signupsThisWeek} this week`}
        />
        <StatCard
          icon={BarChart3}
          label="Analyses Run"
          value={data.totalAnalysesAllTime.toLocaleString()}
          sublabel={`+${data.totalAnalysesToday} today`}
        />
        <StatCard
          icon={PoundSterling}
          label="Revenue"
          value={`£${data.revenueThisMonthGbp.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          sublabel="this month"
        />
        <StatCard
          icon={AlertTriangle}
          label="Errors Today"
          value={data.errorsLast24h === null ? "—" : String(data.errorsLast24h)}
          sublabel={
            data.errorsLast24h === null ? "log table pending" : "last 24 hrs"
          }
        />
      </section>

      {/* ── Recent signups + payments ──────────────────────────────── */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Recent Signups
          </h2>
          {data.recentSignups.length === 0 ? (
            <p className="text-sm text-[#9CA3AF]">No signups yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#9CA3AF]">
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Joined</th>
                  <th className="pb-2 font-medium">Plan</th>
                  <th className="pb-2 text-right font-medium">Analyses</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSignups.map((row) => (
                  <tr
                    key={row.email}
                    className="border-t border-[#2A2D3E]/60 transition-colors hover:bg-[#00BFA5]/5"
                  >
                    <td className="py-2.5 text-white">
                      <span className="truncate">{row.email}</span>
                    </td>
                    <td className="py-2.5 text-[#9CA3AF]">
                      {formatRelativeTime(row.created_at)}
                    </td>
                    <td className="py-2.5">
                      <TierBadge tier={row.tier} />
                    </td>
                    <td className="py-2.5 text-right text-[#9CA3AF]">
                      {row.analysesThisMonth}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Recent Payments
          </h2>
          {data.recentPayments.length === 0 ? (
            <p className="text-sm text-[#9CA3AF]">No payments yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#9CA3AF]">
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayments.map((row, i) => (
                  <tr
                    key={`${row.email}-${i}`}
                    className="border-t border-[#2A2D3E]/60 transition-colors hover:bg-[#00BFA5]/5"
                  >
                    <td className="py-2.5 text-white">
                      <span className="truncate">{row.email}</span>
                    </td>
                    <td className="py-2.5 font-medium text-[#10B981]">
                      £{row.amount_gbp.toFixed(2)}
                    </td>
                    <td className="py-2.5">
                      <TypeBadge type={row.tier} />
                    </td>
                    <td className="py-2.5 text-right text-[#9CA3AF]">
                      {formatRelativeTime(row.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Activity feed — last 20 from admin_activity_log ────────── */}
      <section className="rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-6">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Recent Activity
          </h2>
          <a
            href="/admin/activity"
            className="text-xs text-[#00BFA5] hover:underline"
          >
            View all →
          </a>
        </header>
        {data.recentActivity.length === 0 ? (
          <p className="text-sm text-[#9CA3AF]">
            No events yet — instrumentation just landed, give it a moment.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[#2A2D3E]/60">
            {data.recentActivity.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-white">
                    <span className="font-medium">
                      {event.user_email || "(anonymous)"}
                    </span>{" "}
                    <span className="text-[#9CA3AF]">
                      · {event.event_type.replace("_", " ")}
                    </span>
                  </p>
                </div>
                <span className="shrink-0 text-xs text-[#9CA3AF]">
                  {formatRelativeTime(event.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
