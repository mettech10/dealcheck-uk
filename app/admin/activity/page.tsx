/**
 * /admin/activity — live event feed.
 *
 * Polls /api/admin/activity every 30s. Toggles a "Live" green dot
 * while auto-refresh is active; pausing stops the timer (useful when
 * inspecting a specific row).
 *
 * Each event renders with a per-type icon + colour. Metadata is
 * unpacked shape-aware: analysis shows strategy/postcode, payment
 * shows amount, saved_deal shows address, pdf_export shows address.
 * Unknown shapes fall through to a compact JSON preview.
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Loader2,
  UserPlus,
  BarChart3,
  CreditCard,
  LogIn,
  FileDown,
  BookmarkCheck,
  Activity as ActivityIcon,
  Pause,
  Play,
} from "lucide-react"
import { formatRelativeTime } from "@/lib/admin-format"

interface ActivityEvent {
  id: string
  created_at: string
  event_type: string
  user_id: string | null
  user_email: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
}

const TYPES = [
  { id: "all", label: "All Events" },
  { id: "signup", label: "Signups" },
  { id: "analysis", label: "Analyses" },
  { id: "payment", label: "Payments" },
  { id: "pdf_export", label: "PDF Exports" },
  { id: "saved_deal", label: "Saved Deals" },
  { id: "login", label: "Logins" },
] as const

const ICONS: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  signup: { icon: UserPlus, color: "text-[#10B981] bg-[#10B981]/15" },
  analysis: { icon: BarChart3, color: "text-[#00BFA5] bg-[#00BFA5]/15" },
  payment: { icon: CreditCard, color: "text-[#F59E0B] bg-[#F59E0B]/15" },
  login: { icon: LogIn, color: "text-[#9CA3AF] bg-[#9CA3AF]/15" },
  pdf_export: { icon: FileDown, color: "text-[#3B82F6] bg-[#3B82F6]/15" },
  saved_deal: { icon: BookmarkCheck, color: "text-[#00BFA5] bg-[#00BFA5]/15" },
}

const POLL_INTERVAL_MS = 30_000

function describe(event: ActivityEvent): string {
  const m = event.metadata ?? {}
  switch (event.event_type) {
    case "signup":
      return "Signed up"
    case "analysis": {
      const strat = (m.strategy as string | undefined) ?? "btl"
      const pc = (m.postcode as string | undefined) ?? ""
      return `Ran ${strat.toUpperCase()} analysis${pc ? ` · ${pc}` : ""}`
    }
    case "payment": {
      const tier = (m.tier as string | undefined) ?? "pay_per_analysis"
      const amt = m.amount_gbp as number | undefined
      const label = tier === "pro" ? "Pro subscription" : "Pay Per Analysis"
      return `${label}${amt ? ` · £${amt.toFixed(2)}` : ""}`
    }
    case "pdf_export": {
      const addr = (m.address as string | undefined) ?? ""
      return `Exported PDF${addr ? ` · ${addr}` : ""}`
    }
    case "saved_deal": {
      const addr = (m.address as string | undefined) ?? ""
      return `Saved deal${addr ? ` · ${addr}` : ""}`
    }
    case "login":
      return "Logged in"
    default:
      return event.event_type
  }
}

export default function AdminActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [live, setLive] = useState(true)
  const lastFetchedAt = useRef<number>(0)

  const load = useCallback(async () => {
    setError(null)
    try {
      const r = await fetch(`/api/admin/activity?type=${typeFilter}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = (await r.json()) as { events: ActivityEvent[] }
      setEvents(data.events)
      lastFetchedAt.current = Date.now()
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed")
    } finally {
      setLoading(false)
    }
  }, [typeFilter])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!live) return
    const id = setInterval(() => {
      load()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [live, load])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Activity</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            {loading
              ? "Loading…"
              : `${events.length} events · auto-refresh every 30s`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {live ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#10B981]">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10B981] opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-[#10B981]" />
              </span>
              Live
            </span>
          ) : (
            <span className="text-xs text-[#9CA3AF]">Paused</span>
          )}
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-[#2A2D3E] px-3 py-1.5 text-xs text-white hover:bg-[#00BFA5]/10"
          >
            {live ? <Pause className="size-3" /> : <Play className="size-3" />}
            {live ? "Pause" : "Resume"}
          </button>
        </div>
      </header>

      <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-[#2A2D3E] bg-[#1A1D2E] p-1">
        {TYPES.map((t) => {
          const active = t.id === typeFilter
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypeFilter(t.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-[#00BFA5] text-[#0F1117]"
                  : "text-[#9CA3AF] hover:text-white"
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <section className="overflow-hidden rounded-xl border border-[#2A2D3E] bg-[#1A1D2E]">
        {loading ? (
          <div className="flex items-center justify-center gap-3 p-12 text-sm text-[#9CA3AF]">
            <Loader2 className="size-4 animate-spin text-[#00BFA5]" />
            Loading events…
          </div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-[#EF4444]">
            Failed to load — {error}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-[#9CA3AF]">
            <ActivityIcon className="size-6 text-[#9CA3AF]/50" />
            No events match the current filter.
          </div>
        ) : (
          <ul className="divide-y divide-[#2A2D3E]/60">
            {events.map((event) => {
              const visual = ICONS[event.event_type] ?? {
                icon: ActivityIcon,
                color: "text-[#9CA3AF] bg-[#9CA3AF]/15",
              }
              const Icon = visual.icon
              return (
                <li
                  key={event.id}
                  className="flex items-start gap-4 px-6 py-3 transition-colors hover:bg-[#00BFA5]/5"
                >
                  <div
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full ${visual.color}`}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">
                      {describe(event)}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[#9CA3AF]">
                      {event.user_email ?? "(anonymous)"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-[#9CA3AF]">
                    {formatRelativeTime(event.created_at)}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
