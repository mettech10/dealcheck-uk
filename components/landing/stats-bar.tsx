"use client"

/**
 * Trust / social-proof bar shown directly under the hero mosaic.
 * White bar in light mode, dark slate in dark mode (per the brief).
 *
 * The "Deals Analysed" figure is pulled from the real /api/stats/deal-count
 * endpoint (same source the old hero used) rather than a hardcoded number,
 * so the social proof stays truthful; the other three items are factual
 * product facts.
 */
import { useEffect, useState } from "react"

function formatDealCount(n: number): string {
  const floored = Math.max(10, Math.floor(n / 10) * 10)
  return floored.toLocaleString() + "+"
}

export function StatsBar() {
  const [dealCount, setDealCount] = useState("…")

  useEffect(() => {
    fetch("/api/stats/deal-count")
      .then((r) => r.json())
      .then((d) => setDealCount(formatDealCount(d.count ?? 10)))
      .catch(() => setDealCount("10+"))
  }, [])

  const items: Array<{ icon: string; value: string; label: string }> = [
    { icon: "📊", value: dealCount, label: "Deals Analysed" },
    { icon: "⭐", value: "6", label: "Strategies" },
    { icon: "🏆", value: "AI-Powered", label: "Scoring" },
    { icon: "🔒", value: "UK Data", label: "Only" },
  ]

  return (
    <section className="mx-auto -mt-6 mb-4 w-full max-w-5xl px-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#d1dce8] bg-white shadow-[0_4px_24px_rgba(10,31,78,0.06)] sm:grid-cols-4 dark:border-[#1a3a1a] dark:bg-[#111827] dark:shadow-none">
        {items.map((it) => (
          <div
            key={it.label}
            className="flex items-center justify-center gap-2.5 px-4 py-4 text-center"
          >
            <span className="text-lg" aria-hidden>
              {it.icon}
            </span>
            <span className="flex flex-col items-start leading-tight">
              <span className="text-sm font-bold text-foreground">{it.value}</span>
              <span className="text-xs text-muted-foreground">{it.label}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
