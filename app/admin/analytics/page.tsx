/**
 * /admin/analytics — four charts driven by /api/admin/analytics.
 *
 * Range selector: Today / 7 Days / 30 Days / All Time. Changing it
 * refetches; we don't try to memoise across ranges because the
 * aggregations are cheap server-side and the data should always
 * reflect the chosen window.
 *
 * recharts is already in deps. All four charts share the same
 * dark/teal palette — no white backgrounds anywhere.
 */

"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from "recharts"

type RangeKey = "today" | "7d" | "30d" | "all"

interface AnalyticsPayload {
  range: RangeKey
  analysesOverTime: Array<{ date: string; count: number }>
  strategyBreakdown: Array<{ strategy: string; count: number }>
  revenueOverTime: Array<{ week: string; amount: number }>
  userGrowth: Array<{ week: string; cumulative: number }>
}

const RANGES: Array<{ id: RangeKey; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "all", label: "All Time" },
]

const TEAL = "#00BFA5"
const GRID = "#2A2D3E"
const AXIS = "#9CA3AF"
const TOOLTIP_BG = "#1A1D2E"

// Teal palette for the strategy bars — same hue, decreasing
// luminance so the order reads as a ranking.
const TEAL_SHADES = ["#00BFA5", "#33CDB8", "#66DBCA", "#99E9DC", "#CCF6EE", "#E5FAF6"]

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState<RangeKey>("7d")
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/admin/analytics?range=${range}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as AnalyticsPayload
      })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "load failed")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [range])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Analytics</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            Platform activity across the selected window.
          </p>
        </div>
        <div className="inline-flex items-center rounded-full border border-[#2A2D3E] bg-[#1A1D2E] p-1">
          {RANGES.map((r) => {
            const active = r.id === range
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-[#00BFA5] text-[#0F1117]"
                    : "text-[#9CA3AF] hover:text-white"
                }`}
              >
                {r.label}
              </button>
            )
          })}
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm text-[#EF4444]">
          Failed to load analytics — {error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Analyses Over Time"
          subtitle="Per day, in the selected window"
          loading={loading}
          empty={!data?.analysesOverTime.length}
        >
          {data && (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={data.analysesOverTime}
                margin={{ top: 8, right: 16, bottom: 8, left: -12 }}
              >
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  stroke={AXIS}
                  tick={{ fill: AXIS, fontSize: 11 }}
                />
                <YAxis stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: TOOLTIP_BG,
                    border: `1px solid ${GRID}`,
                    borderRadius: 8,
                    color: "#fff",
                  }}
                  cursor={{ stroke: TEAL, strokeOpacity: 0.3 }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={TEAL}
                  strokeWidth={2}
                  dot={{ r: 3, fill: TEAL }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Strategy Breakdown"
          subtitle="From saved analyses in the window"
          loading={loading}
          empty={!data?.strategyBreakdown.length}
        >
          {data && (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={data.strategyBreakdown}
                layout="vertical"
                margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
              >
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  stroke={AXIS}
                  tick={{ fill: AXIS, fontSize: 11 }}
                />
                <YAxis
                  dataKey="strategy"
                  type="category"
                  stroke={AXIS}
                  tick={{ fill: AXIS, fontSize: 11 }}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: TOOLTIP_BG,
                    border: `1px solid ${GRID}`,
                    borderRadius: 8,
                    color: "#fff",
                  }}
                  cursor={{ fill: "rgba(0,191,165,0.08)" }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {data.strategyBreakdown.map((_, i) => (
                    <rect
                      key={i}
                      fill={TEAL_SHADES[i % TEAL_SHADES.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Revenue Over Time"
          subtitle="Succeeded payments by week (GBP)"
          loading={loading}
          empty={!data?.revenueOverTime.length}
        >
          {data && (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart
                data={data.revenueOverTime}
                margin={{ top: 8, right: 16, bottom: 8, left: -12 }}
              >
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TEAL} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis
                  dataKey="week"
                  stroke={AXIS}
                  tick={{ fill: AXIS, fontSize: 11 }}
                />
                <YAxis
                  stroke={AXIS}
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickFormatter={(v) => `£${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: TOOLTIP_BG,
                    border: `1px solid ${GRID}`,
                    borderRadius: 8,
                    color: "#fff",
                  }}
                  formatter={(v: number) => [`£${v.toFixed(2)}`, "Revenue"]}
                  cursor={{ stroke: TEAL, strokeOpacity: 0.3 }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke={TEAL}
                  strokeWidth={2}
                  fill="url(#revFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="User Growth"
          subtitle="Cumulative users by week"
          loading={loading}
          empty={!data?.userGrowth.length}
        >
          {data && (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={data.userGrowth}
                margin={{ top: 8, right: 16, bottom: 8, left: -12 }}
              >
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis
                  dataKey="week"
                  stroke={AXIS}
                  tick={{ fill: AXIS, fontSize: 11 }}
                />
                <YAxis stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: TOOLTIP_BG,
                    border: `1px solid ${GRID}`,
                    borderRadius: 8,
                    color: "#fff",
                  }}
                  cursor={{ stroke: TEAL, strokeOpacity: 0.3 }}
                />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke={TEAL}
                  strokeWidth={2}
                  dot={{ r: 3, fill: TEAL }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </section>
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  loading,
  empty,
  children,
}: {
  title: string
  subtitle: string
  loading: boolean
  empty: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-6">
      <header>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <p className="mt-0.5 text-xs text-[#9CA3AF]">{subtitle}</p>
      </header>
      {loading ? (
        <div className="flex h-[260px] items-center justify-center gap-2 text-sm text-[#9CA3AF]">
          <Loader2 className="size-4 animate-spin text-[#00BFA5]" />
          Loading…
        </div>
      ) : empty ? (
        <div className="flex h-[260px] items-center justify-center text-sm text-[#9CA3AF]">
          No data in this window.
        </div>
      ) : (
        children
      )}
    </div>
  )
}
