"use client"

/**
 * /admin/masterclass — the masterclass funnel dashboard (Section 7).
 *
 * Reads /api/admin/masterclass-funnel and shows:
 *   - the headline funnel (downloads → signups → paid, with %s)
 *   - breakdowns by investor type, strategy and UTM source, with the
 *     best-converting segments highlighted so ad spend can follow them
 *   - email sequence performance (sends per stage, signups by the stage
 *     the lead had reached when they converted)
 *
 * Same dark palette as /admin/analytics: #1A1D2E cards on #0F1117,
 * #2A2D3E borders, teal accents.
 */

import { useEffect, useState } from "react"
import { Loader2, Download, UserPlus, CreditCard, MailX, TrendingUp } from "lucide-react"

interface SegmentStats {
  segment: string
  downloads: number
  signups: number
  paid: number
  conversionPct: number
}

interface FunnelPayload {
  totals: {
    downloads: number
    signups: number
    signupPct: number
    paid: number
    paidPct: number
    unsubscribed: number
  }
  byInvestorType: SegmentStats[]
  byStrategy: SegmentStats[]
  byUtmSource: SegmentStats[]
  emailPerformance: {
    stageSent: Record<string, number>
    signupsByStage: Record<string, number>
  }
}

const INVESTOR_LABELS: Record<string, string> = {
  new: "New to investing",
  active: "Active (1-5 props)",
  experienced: "Experienced (5+)",
  sourcer: "Deal sourcer",
  agent: "Agent / broker",
  researching: "Just researching",
  unknown: "Not answered",
}

const STAGE_LABELS: Record<string, string> = {
  "1": "Email 1 · Welcome + PDF (day 0)",
  "2": "Email 2 · Personalised lesson (day 2)",
  "3": "Email 3 · Second lesson (day 4)",
  "4": "Email 4 · Check-in (day 7)",
  "5": "Email 5 · Final nudge (day 12)",
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-5">
      <div className="mb-2 flex items-center gap-2 text-sm text-gray-400">
        <Icon className="size-4 text-[#00BFA5]" />
        {label}
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

function SegmentTable({
  title,
  rows,
  labelMap,
  bestSegment,
}: {
  title: string
  rows: SegmentStats[]
  labelMap?: Record<string, string>
  bestSegment?: string | null
}) {
  return (
    <div className="rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-5">
      <h2 className="mb-4 text-sm font-semibold text-white">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No leads yet</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2A2D3E] text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="pb-2 font-medium">Segment</th>
              <th className="pb-2 text-right font-medium">Downloads</th>
              <th className="pb-2 text-right font-medium">Signups</th>
              <th className="pb-2 text-right font-medium">Paid</th>
              <th className="pb-2 text-right font-medium">Conv %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isBest = bestSegment === r.segment
              return (
                <tr key={r.segment} className="border-b border-[#2A2D3E]/50">
                  <td className="py-2 text-gray-300">
                    {labelMap?.[r.segment] ?? r.segment}
                    {isBest && (
                      <span className="ml-2 rounded bg-[#00BFA5]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#00BFA5]">
                        BEST
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right text-gray-300">{r.downloads}</td>
                  <td className="py-2 text-right text-gray-300">{r.signups}</td>
                  <td className="py-2 text-right text-gray-300">{r.paid}</td>
                  <td className={`py-2 text-right font-semibold ${isBest ? "text-[#00BFA5]" : "text-gray-300"}`}>
                    {r.conversionPct}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** Best segment = highest signup conversion among segments with 5+ downloads. */
function bestOf(rows: SegmentStats[]): string | null {
  const eligible = rows.filter((r) => r.downloads >= 5 && r.segment !== "unknown")
  if (eligible.length === 0) return null
  return eligible.reduce((a, b) => (b.conversionPct > a.conversionPct ? b : a)).segment
}

export default function AdminMasterclassPage() {
  const [data, setData] = useState<FunnelPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/admin/masterclass-funnel")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as FunnelPayload
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "load failed"))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#00BFA5]" />
      </div>
    )
  }

  if (error || !data) {
    return <p className="text-sm text-red-400">Failed to load funnel: {error}</p>
  }

  const { totals, emailPerformance } = data

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Masterclass Funnel</h1>
        <p className="mt-1 text-sm text-gray-400">
          Downloads → Metalyzi signups → paid, from the /masterclass lead magnet
        </p>
      </header>

      {/* Headline funnel */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Download} label="Total downloads" value={String(totals.downloads)} />
        <StatCard
          icon={UserPlus}
          label="Signed up to Metalyzi"
          value={String(totals.signups)}
          sub={`${totals.signupPct}% of downloads`}
        />
        <StatCard
          icon={CreditCard}
          label="Converted to paid"
          value={String(totals.paid)}
          sub={`${totals.paidPct}% of downloads`}
        />
        <StatCard
          icon={MailX}
          label="Unsubscribed"
          value={String(totals.unsubscribed)}
          sub="excluded from nurture"
        />
      </div>

      {/* Segment breakdowns */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SegmentTable
          title="By investor type"
          rows={data.byInvestorType}
          labelMap={INVESTOR_LABELS}
          bestSegment={bestOf(data.byInvestorType)}
        />
        <SegmentTable
          title="By strategy interest"
          rows={data.byStrategy}
          bestSegment={bestOf(data.byStrategy)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SegmentTable
          title="By UTM source"
          rows={data.byUtmSource}
          bestSegment={bestOf(data.byUtmSource)}
        />

        {/* Email performance */}
        <div className="rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-5">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
            <TrendingUp className="size-4 text-[#00BFA5]" />
            Email sequence performance
          </h2>
          <p className="mb-4 text-xs text-gray-500">
            Signups column = leads who signed up while at that stage (the
            sequence stops on signup, so this is the email that converted them)
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2A2D3E] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="pb-2 font-medium">Stage</th>
                <th className="pb-2 text-right font-medium">Received</th>
                <th className="pb-2 text-right font-medium">Signups at stage</th>
              </tr>
            </thead>
            <tbody>
              {["1", "2", "3", "4", "5"].map((stage) => (
                <tr key={stage} className="border-b border-[#2A2D3E]/50">
                  <td className="py-2 text-gray-300">{STAGE_LABELS[stage]}</td>
                  <td className="py-2 text-right text-gray-300">
                    {emailPerformance.stageSent[stage] ?? 0}
                  </td>
                  <td className="py-2 text-right font-semibold text-[#00BFA5]">
                    {emailPerformance.signupsByStage[stage] ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
