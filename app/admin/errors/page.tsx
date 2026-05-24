/**
 * /admin/errors — error log browser with resolve workflow.
 *
 * Filters: status (All / Unresolved / Resolved) + type. Both refetch
 * server-side. Mark-resolved is optimistic: flip the row locally
 * then PATCH; revert on failure.
 */

"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, CheckCircle2, RotateCcw } from "lucide-react"
import { formatRelativeTime } from "@/lib/admin-format"

interface ErrorRow {
  id: string
  created_at: string
  error_type: string | null
  message: string | null
  stack: string | null
  user_id: string | null
  endpoint: string | null
  resolved: boolean
  resolved_at: string | null
}

const STATUS_OPTIONS = [
  { id: "all", label: "All" },
  { id: "false", label: "Unresolved" },
  { id: "true", label: "Resolved" },
] as const

const TYPE_OPTIONS = [
  { id: "all", label: "All types" },
  { id: "api_error", label: "API" },
  { id: "scraper_error", label: "Scraper" },
  { id: "payment_error", label: "Payment" },
  { id: "auth_error", label: "Auth" },
  { id: "frontend_error", label: "Frontend" },
  { id: "flask_5xx", label: "Flask 5xx" },
  { id: "unknown", label: "Unknown" },
] as const

const TYPE_BADGE_STYLE: Record<string, string> = {
  api_error: "bg-[#F59E0B]/20 text-[#F59E0B]",
  scraper_error: "bg-[#3B82F6]/20 text-[#60A5FA]",
  payment_error: "bg-[#EF4444]/20 text-[#EF4444]",
  auth_error: "bg-[#EF4444]/20 text-[#EF4444]",
  frontend_error: "bg-[#9CA3AF]/20 text-[#9CA3AF]",
  flask_5xx: "bg-[#EF4444]/20 text-[#EF4444]",
  unknown: "bg-[#9CA3AF]/20 text-[#9CA3AF]",
}

export default function AdminErrorsPage() {
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_OPTIONS)[number]["id"]>("false")
  const [typeFilter, setTypeFilter] = useState("all")
  const [rows, setRows] = useState<ErrorRow[]>([])
  const [unresolvedCount, setUnresolvedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openRowId, setOpenRowId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = `/api/admin/errors?resolved=${statusFilter}&type=${typeFilter}`
      const r = await fetch(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = (await r.json()) as {
        errors: ErrorRow[]
        unresolvedCount: number
      }
      setRows(data.errors)
      setUnresolvedCount(data.unresolvedCount)
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed")
    } finally {
      setLoading(false)
    }
  }, [statusFilter, typeFilter])

  useEffect(() => {
    load()
  }, [load])

  const setResolved = async (id: string, resolved: boolean) => {
    // Optimistic — toggle locally first, revert on failure.
    setRows((current) =>
      current.map((r) => (r.id === id ? { ...r, resolved } : r)),
    )
    try {
      const res = await fetch("/api/admin/errors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, resolved }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // Refresh the unresolved count via a reload (cheap).
      load()
    } catch {
      setRows((current) =>
        current.map((r) => (r.id === id ? { ...r, resolved: !resolved } : r)),
      )
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Errors</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            {unresolvedCount} unresolved · {rows.length} shown
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-full border border-[#2A2D3E] bg-[#1A1D2E] p-1">
          {STATUS_OPTIONS.map((opt) => {
            const active = opt.id === statusFilter
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-[#00BFA5] text-[#0F1117]"
                    : "text-[#9CA3AF] hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-md border border-[#2A2D3E] bg-[#1A1D2E] px-3 text-sm text-white focus:border-[#00BFA5] focus:outline-none"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t.id} value={t.id} className="bg-[#1A1D2E]">
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <section className="overflow-hidden rounded-xl border border-[#2A2D3E] bg-[#1A1D2E]">
        {loading ? (
          <div className="flex items-center justify-center gap-3 p-12 text-sm text-[#9CA3AF]">
            <Loader2 className="size-4 animate-spin text-[#00BFA5]" />
            Loading errors…
          </div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-[#EF4444]">
            Failed to load — {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#9CA3AF]">
            No errors match the current filter.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#1A1D2E]">
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#9CA3AF]">
                <th className="px-6 py-3 font-medium">Time</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Endpoint</th>
                <th className="px-3 py-3 font-medium">Message</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const typeKey = row.error_type ?? "unknown"
                const isOpen = openRowId === row.id
                return (
                  <>
                    <tr
                      key={row.id}
                      className="border-t border-[#2A2D3E]/60 transition-colors hover:bg-[#00BFA5]/5"
                    >
                      <td className="px-6 py-3 text-[#9CA3AF]">
                        {formatRelativeTime(row.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            TYPE_BADGE_STYLE[typeKey] ?? TYPE_BADGE_STYLE.unknown
                          }`}
                        >
                          {typeKey.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-[#9CA3AF]">
                        {row.endpoint || "—"}
                      </td>
                      <td className="px-3 py-3 text-white">
                        <button
                          type="button"
                          onClick={() => setOpenRowId(isOpen ? null : row.id)}
                          className="line-clamp-1 max-w-[420px] text-left hover:text-[#00BFA5]"
                        >
                          {row.message || "(no message)"}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        {row.resolved ? (
                          <span className="inline-flex items-center rounded-full bg-[#10B981]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#10B981]">
                            Resolved
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-[#EF4444]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#EF4444]">
                            Open
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {row.resolved ? (
                          <button
                            type="button"
                            onClick={() => setResolved(row.id, false)}
                            className="inline-flex items-center gap-1 rounded-md border border-[#2A2D3E] px-2.5 py-1 text-xs text-[#9CA3AF] hover:bg-[#00BFA5]/10 hover:text-white"
                          >
                            <RotateCcw className="size-3" />
                            Reopen
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setResolved(row.id, true)}
                            className="inline-flex items-center gap-1 rounded-md border border-[#00BFA5]/30 bg-[#00BFA5]/10 px-2.5 py-1 text-xs text-[#00BFA5] hover:bg-[#00BFA5]/20"
                          >
                            <CheckCircle2 className="size-3" />
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (row.message || row.stack) && (
                      <tr className="bg-black/30">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="flex flex-col gap-3 text-xs">
                            <div>
                              <p className="mb-1 font-medium uppercase tracking-wider text-[#9CA3AF]">
                                Message
                              </p>
                              <p className="whitespace-pre-wrap font-mono text-white">
                                {row.message}
                              </p>
                            </div>
                            {row.stack && (
                              <div>
                                <p className="mb-1 font-medium uppercase tracking-wider text-[#9CA3AF]">
                                  Stack
                                </p>
                                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-[#2A2D3E] bg-black/50 p-3 font-mono text-[#9CA3AF]">
                                  {row.stack}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
