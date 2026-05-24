/**
 * /admin/payments — every Stripe transaction the webhook has logged.
 *
 * Client component over a server-loaded snapshot (/api/admin/payments).
 * Same pattern as the Users page — keep load + interaction concerns
 * apart so search / filter / sort don't re-trip the join.
 *
 * Features per the brief:
 *   - Totals card: This Month + All Time, GBP
 *   - Table: Date / Email / Type / Amount / Stripe Session ID / Status
 *   - Stripe session id links to https://dashboard.stripe.com/payments/{id}
 *   - CSV export of the currently visible rows (client-side)
 */

"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, ExternalLink, Loader2 } from "lucide-react"
import { TypeBadge } from "@/components/admin/type-badge"
import { StatCard } from "@/components/admin/stat-card"
import { PoundSterling, Calendar } from "lucide-react"
import { formatGbp, formatRelativeTime } from "@/lib/admin-format"

interface PaymentRow {
  id: string
  user_id: string
  email: string
  amount_gbp: number
  tier: string
  status: string
  stripe_session_id: string | null
  created_at: string
}

const STATUS_STYLES: Record<string, string> = {
  succeeded: "bg-[#10B981]/20 text-[#10B981]",
  failed: "bg-[#EF4444]/20 text-[#EF4444]",
  refunded: "bg-[#F59E0B]/20 text-[#F59E0B]",
  pending: "bg-[#9CA3AF]/20 text-[#9CA3AF]",
}

function StatusBadge({ status }: { status: string }) {
  const key = status in STATUS_STYLES ? status : "pending"
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLES[key]}`}
    >
      {status}
    </span>
  )
}

function toCsv(rows: PaymentRow[]): string {
  const head = [
    "date",
    "email",
    "type",
    "amount_gbp",
    "status",
    "stripe_session_id",
  ]
  const lines = [head.join(",")]
  for (const r of rows) {
    const cells = [
      r.created_at,
      r.email,
      r.tier,
      r.amount_gbp.toFixed(2),
      r.status,
      r.stripe_session_id ?? "",
    ].map((v) => {
      const s = String(v)
      // Escape per RFC 4180 — quote anything containing a comma,
      // quote or newline; double internal quotes.
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    })
    lines.push(cells.join(","))
  }
  return lines.join("\n")
}

function downloadCsv(content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  const dateStamp = new Date().toISOString().slice(0, 10)
  link.download = `metalyzi-payments-${dateStamp}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/payments")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as { payments: PaymentRow[] }
      })
      .then((data) => {
        if (!cancelled) setPayments(data.payments)
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
  }, [])

  const totals = useMemo(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    let monthly = 0
    let total = 0
    for (const p of payments) {
      if (p.status !== "succeeded") continue
      total += p.amount_gbp
      if (new Date(p.created_at).getTime() >= startOfMonth) monthly += p.amount_gbp
    }
    return { monthly, total }
  }, [payments])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Payments</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            {loading
              ? "Loading…"
              : `${payments.length} transaction${payments.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          type="button"
          disabled={loading || payments.length === 0}
          onClick={() => downloadCsv(toCsv(payments))}
          className="inline-flex items-center gap-2 rounded-md border border-[#2A2D3E] bg-[#1A1D2E] px-4 py-2 text-sm text-white transition-colors disabled:opacity-40 hover:enabled:bg-[#00BFA5]/10 hover:enabled:text-[#00BFA5]"
        >
          <Download className="size-4" />
          Export CSV
        </button>
      </header>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <StatCard
          icon={Calendar}
          label="Revenue · This Month"
          value={formatGbp(totals.monthly)}
          sublabel="succeeded transactions only"
        />
        <StatCard
          icon={PoundSterling}
          label="Revenue · All Time"
          value={formatGbp(totals.total)}
          sublabel="lifetime"
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-[#2A2D3E] bg-[#1A1D2E]">
        {loading ? (
          <div className="flex items-center justify-center gap-3 p-12 text-sm text-[#9CA3AF]">
            <Loader2 className="size-4 animate-spin text-[#00BFA5]" />
            Loading payments…
          </div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-[#EF4444]">
            Failed to load payments — {error}
          </div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#9CA3AF]">
            No payments recorded yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#1A1D2E]">
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#9CA3AF]">
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Email</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 text-right font-medium">Amount</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Stripe Session</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-[#2A2D3E]/60 transition-colors hover:bg-[#00BFA5]/5"
                >
                  <td className="px-6 py-3 text-[#9CA3AF]">
                    {formatRelativeTime(p.created_at)}
                  </td>
                  <td className="px-3 py-3 text-white">{p.email}</td>
                  <td className="px-3 py-3">
                    <TypeBadge type={p.tier} />
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-[#10B981]">
                    {formatGbp(p.amount_gbp)}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] text-[#9CA3AF]">
                    {p.stripe_session_id ? (
                      <a
                        href={`https://dashboard.stripe.com/payments/${p.stripe_session_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:text-[#00BFA5]"
                      >
                        {p.stripe_session_id.slice(0, 20)}…
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
