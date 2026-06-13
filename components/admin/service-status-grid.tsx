"use client"

/**
 * Service status grid — polls /api/admin/system/status on mount and
 * on demand via the "Check All" button.
 *
 * Each card shows the service name, status colour, latency or error
 * message, and last-checked relative time. Pings run in parallel
 * on the server (3s timeout each) so the round-trip is bounded.
 */

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, AlertCircle, XCircle, MinusCircle, RefreshCw, Loader2 } from "lucide-react"
import { formatRelativeTime } from "@/lib/admin-format"

type ServiceStatus = "ok" | "slow" | "down" | "unconfigured"

interface ProbeResult {
  service: string
  status: ServiceStatus
  latencyMs: number | null
  message: string
  checkedAt: string
}

const STATUS_VISUAL: Record<
  ServiceStatus,
  {
    icon: React.ComponentType<{ className?: string }>
    color: string
    label: string
    border: string
  }
> = {
  ok: {
    icon: CheckCircle2,
    color: "text-[#10B981]",
    label: "Operational",
    border: "border-[#10B981]/30 bg-[#10B981]/5",
  },
  slow: {
    icon: AlertCircle,
    color: "text-[#F59E0B]",
    label: "Slow",
    border: "border-[#F59E0B]/30 bg-[#F59E0B]/5",
  },
  down: {
    icon: XCircle,
    color: "text-[#EF4444]",
    label: "Down",
    border: "border-[#EF4444]/30 bg-[#EF4444]/5",
  },
  unconfigured: {
    icon: MinusCircle,
    color: "text-[#9CA3AF]",
    label: "Unconfigured",
    border: "border-[#2A2D3E] bg-[#1A1D2E]",
  },
}

export function ServiceStatusGrid() {
  const [probes, setProbes] = useState<ProbeResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch("/api/admin/system/status")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = (await r.json()) as { probes: ProbeResult[] }
      setProbes(data.probes)
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const downCount = probes.filter((p) => p.status === "down").length
  const slowCount = probes.filter((p) => p.status === "slow").length

  return (
    <section className="rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Service Status
          </h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            {downCount > 0
              ? `${downCount} service${downCount === 1 ? "" : "s"} down`
              : slowCount > 0
                ? `${slowCount} slow`
                : "All services responsive"}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-[#2A2D3E] bg-[#1A1D2E] px-3 py-1.5 text-xs text-white transition-colors hover:bg-[#00BFA5]/10 hover:text-[#00BFA5] disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {loading ? "Checking…" : "Check All"}
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-xs text-[#EF4444]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(probes.length > 0
          ? probes
          : Array.from({ length: 8 }, (_, i) => ({
              service: "Loading…",
              status: "unconfigured" as ServiceStatus,
              latencyMs: null,
              message: "",
              checkedAt: new Date().toISOString(),
              _key: i,
            }))
        ).map((probe) => {
          const visual = STATUS_VISUAL[probe.status]
          const Icon = visual.icon
          return (
            <div
              key={probe.service + ((probe as { _key?: number })._key ?? "")}
              className={`flex flex-col gap-2 rounded-lg border p-3 ${visual.border}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-white">
                  {probe.service}
                </span>
                <Icon className={`size-4 ${visual.color}`} />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-xs font-semibold ${visual.color}`}>
                  {visual.label}
                </span>
                {probe.latencyMs !== null && (
                  <span className="text-[10px] text-[#9CA3AF]">
                    {probe.latencyMs}ms
                  </span>
                )}
              </div>
              {probe.message && probe.status !== "ok" && (
                <p className="line-clamp-2 text-[10px] text-[#9CA3AF]">
                  {probe.message}
                </p>
              )}
              <p className="text-[10px] text-[#9CA3AF]/70">
                {probes.length > 0
                  ? `Checked ${formatRelativeTime(probe.checkedAt)}`
                  : ""}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
