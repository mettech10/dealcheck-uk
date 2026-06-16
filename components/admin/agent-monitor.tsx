"use client"

/**
 * Self-learning agent monitor — live health of the scheduled agents.
 *
 * Polls /api/admin/agents/status on mount and every 30s (plus manual
 * refresh), shows a health card per agent, and lets the admin trigger a run
 * on demand via /api/admin/agents/run. Mirrors the visual language of the
 * service-status grid on /admin/system.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
  Play,
  Lightbulb,
  Bug,
} from "lucide-react"
import { formatRelativeTime } from "@/lib/admin-format"

type Health = "healthy" | "failing" | "stale" | "pending"

interface AgentItem {
  slug: string
  name: string
  label: string
  schedule: string
  scheduleLabel: string
  lastRun: string | null
  lastStatus: "success" | "error" | null
  itemsProcessed: number
  durationMs: number | null
  lastError: string | null
  health: Health
}

interface StatusResponse {
  agents: AgentItem[]
  summary: Record<Health | "total", number>
  recentInsights: { agent: string; label: string; text: string; at: string }[]
  recentErrors: { agent: string; label: string; text: string; at: string }[]
  generatedAt: string
}

const HEALTH_VISUAL: Record<
  Health,
  { icon: React.ComponentType<{ className?: string }>; color: string; label: string; border: string }
> = {
  healthy: {
    icon: CheckCircle2,
    color: "text-[#10B981]",
    label: "Healthy",
    border: "border-[#10B981]/30 bg-[#10B981]/5",
  },
  failing: {
    icon: XCircle,
    color: "text-[#EF4444]",
    label: "Failing",
    border: "border-[#EF4444]/30 bg-[#EF4444]/5",
  },
  stale: {
    icon: AlertCircle,
    color: "text-[#F59E0B]",
    label: "Overdue",
    border: "border-[#F59E0B]/30 bg-[#F59E0B]/5",
  },
  pending: {
    icon: Clock,
    color: "text-[#9CA3AF]",
    label: "Not yet run",
    border: "border-[#2A2D3E] bg-[#13151F]",
  },
}

const POLL_MS = 30_000

export function AgentMonitor() {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/agents/status", { cache: "no-store" })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setData((await r.json()) as StatusResponse)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    timer.current = setInterval(load, POLL_MS)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [load])

  const runNow = useCallback(
    async (slug: string, label: string) => {
      setRunning(slug)
      setNote(`Running ${label}… scraping agents can take a few minutes.`)
      try {
        const r = await fetch("/api/admin/agents/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ agent: slug }),
        })
        const body = (await r.json().catch(() => ({}))) as { error?: string; itemsProcessed?: number }
        if (body.error) setNote(`${label} finished with an error: ${body.error}`)
        else setNote(`${label} finished — ${body.itemsProcessed ?? 0} item(s) processed.`)
      } catch (e) {
        setNote(`${label} request did not return cleanly (${e instanceof Error ? e.message : "error"}). It may still be running — refreshing.`)
      } finally {
        setRunning(null)
        load()
      }
    },
    [load],
  )

  const summary = data?.summary
  const agents = data?.agents ?? []

  return (
    <section className="rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Self-Learning Agents
          </h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            {summary
              ? summary.failing > 0
                ? `${summary.failing} failing · ${summary.healthy} healthy of ${summary.total}`
                : summary.stale > 0
                  ? `${summary.stale} overdue · ${summary.healthy} healthy of ${summary.total}`
                  : `All ${summary.total} agents healthy`
              : "Loading agent health…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/admin/intelligence" className="text-xs text-[#00BFA5] hover:underline">
            Intelligence →
          </a>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-[#2A2D3E] bg-[#1A1D2E] px-3 py-1.5 text-xs text-white transition-colors hover:bg-[#00BFA5]/10 hover:text-[#00BFA5] disabled:opacity-40"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-xs text-[#EF4444]">
          {error}
        </div>
      )}
      {note && (
        <div className="mb-4 rounded-md border border-[#00BFA5]/30 bg-[#00BFA5]/5 p-3 text-xs text-[#9CA3AF]">
          {note}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(agents.length > 0
          ? agents
          : Array.from({ length: 5 }, (_, i) => ({ slug: `_${i}`, label: "Loading…", health: "pending" as Health }) as AgentItem)
        ).map((a) => {
          const visual = HEALTH_VISUAL[a.health]
          const Icon = visual.icon
          const isRunning = running === a.slug
          return (
            <div key={a.slug} className={`flex flex-col gap-2 rounded-lg border p-3 ${visual.border}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-white">{a.label}</span>
                <Icon className={`size-4 shrink-0 ${visual.color}`} />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-xs font-semibold ${visual.color}`}>{visual.label}</span>
                <span className="text-[10px] text-[#9CA3AF]">{a.scheduleLabel}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-[10px] text-[#9CA3AF]">
                <span>{a.lastRun ? `Ran ${formatRelativeTime(a.lastRun)}` : "Never run"}</span>
                {a.lastRun && <span>{a.itemsProcessed} item{a.itemsProcessed === 1 ? "" : "s"}</span>}
              </div>
              {a.health === "failing" && a.lastError && (
                <p className="line-clamp-2 text-[10px] text-[#EF4444]/90">{a.lastError}</p>
              )}
              {agents.length > 0 && (
                <button
                  type="button"
                  onClick={() => runNow(a.slug, a.label)}
                  disabled={isRunning || running !== null}
                  className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-[#2A2D3E] bg-[#1A1D2E] px-2.5 py-1 text-[11px] text-white transition-colors hover:bg-[#00BFA5]/10 hover:text-[#00BFA5] disabled:opacity-40"
                >
                  {isRunning ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                  {isRunning ? "Running…" : "Run now"}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Recent insights + errors */}
      {(data?.recentInsights.length || data?.recentErrors.length) ? (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              <Lightbulb className="size-3.5" /> Recent insights
            </h3>
            {data?.recentInsights.length ? (
              <ul className="flex flex-col divide-y divide-[#2A2D3E]/60">
                {data.recentInsights.map((ins, i) => (
                  <li key={i} className="py-2 text-xs">
                    <span className="text-slate-200">{ins.text}</span>
                    <span className="ml-2 text-[10px] text-[#9CA3AF]">
                      {ins.label} · {formatRelativeTime(ins.at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#9CA3AF]">None yet.</p>
            )}
          </div>
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              <Bug className="size-3.5" /> Recent errors
            </h3>
            {data?.recentErrors.length ? (
              <ul className="flex flex-col divide-y divide-[#2A2D3E]/60">
                {data.recentErrors.map((e, i) => (
                  <li key={i} className="py-2 text-xs">
                    <span className="text-[#EF4444]/90">{e.text}</span>
                    <span className="ml-2 text-[10px] text-[#9CA3AF]">
                      {e.label} · {formatRelativeTime(e.at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#9CA3AF]">No errors logged.</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
