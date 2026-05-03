"use client"

import { useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { BarChart3, TrendingUp, Minus, AlertTriangle, Info } from "lucide-react"
import { formatCurrency } from "@/lib/calculations"

interface AirroiMarket {
  marketName: string
  avgNightlyRate: number
  avgOccupancyRate: number
  avgMonthlyRevenue: number
  revPAR: number
  avgLengthOfStay: number
  totalActiveListings: number
  dataSource: string
}

interface SAAreaIntelligenceProps {
  postcode: string
  bedrooms: number
  userNightlyRate?: number
  userOccupancyRate?: number
}

type Demand = "high" | "moderate" | "low"

function demandLevel(occ: number): Demand {
  if (occ >= 70) return "high"
  if (occ >= 50) return "moderate"
  return "low"
}

const DEMAND_CONFIG: Record<
  Demand,
  { label: string; emoji: string; bg: string; color: string; ring: string }
> = {
  high:     { label: "HIGH DEMAND",     emoji: "🟢", bg: "bg-emerald-500/10", color: "text-emerald-600", ring: "ring-emerald-500/30" },
  moderate: { label: "MODERATE DEMAND", emoji: "🟡", bg: "bg-amber-500/10",   color: "text-amber-600",   ring: "ring-amber-500/30" },
  low:      { label: "LOW DEMAND",      emoji: "🔴", bg: "bg-red-500/10",     color: "text-red-600",     ring: "ring-red-500/30" },
}

export function SAAreaIntelligence({
  postcode,
  bedrooms,
  userNightlyRate,
  userOccupancyRate,
}: SAAreaIntelligenceProps) {
  const [market, setMarket] = useState<AirroiMarket | null>(null)
  const [loading, setLoading] = useState(true)
  const district = postcode.split(" ")[0] || postcode

  useEffect(() => {
    if (!postcode) return
    setLoading(true)
    fetch("/api/comparables/sa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcode, bedrooms }),
    })
      .then((r) => r.json())
      .then((data) => {
        console.log("[SA AREA INTEL] airroiMarket:", data?.airroiMarket)
        setMarket(data?.airroiMarket ?? null)
      })
      .catch((err) => console.error("[SA AREA INTEL] fetch error:", err))
      .finally(() => setLoading(false))
  }, [postcode, bedrooms])

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            <CardTitle className="text-sm">SA Area Intelligence</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="h-6 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    )
  }

  // Airroi unavailable / empty — show fallback message, never an empty card.
  if (!market || !market.avgNightlyRate || market.avgNightlyRate <= 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            <CardTitle className="text-sm">SA Area Intelligence</CardTitle>
          </div>
          <CardDescription className="text-xs">{district}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              SA area data unavailable for {district} — verify local demand
              independently on Airbnb / AirDNA before committing to occupancy
              and nightly-rate assumptions.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const demand = demandLevel(market.avgOccupancyRate)
  const cfg = DEMAND_CONFIG[demand]

  // Rate comparison
  const userRate = userNightlyRate && userNightlyRate > 0 ? userNightlyRate : null
  const rateDiffPct = userRate
    ? ((userRate - market.avgNightlyRate) / market.avgNightlyRate) * 100
    : null
  const rateBadge =
    rateDiffPct === null
      ? null
      : rateDiffPct > 5
        ? { text: `${rateDiffPct.toFixed(0)}% above market`, color: "text-amber-600" }
        : rateDiffPct < -5
          ? { text: `${Math.abs(rateDiffPct).toFixed(0)}% below market`, color: "text-emerald-600" }
          : { text: "in line with market", color: "text-muted-foreground" }

  // Verdict text
  const userOccTooHigh =
    userOccupancyRate && userOccupancyRate > market.avgOccupancyRate + 10

  let verdict: { tone: "good" | "warn" | "bad"; text: string }
  if (demand === "low") {
    verdict = {
      tone: "bad",
      text: `⚠ Low SA demand in ${district}. Consider whether location supports short-let occupancy — ${market.avgOccupancyRate.toFixed(0)}% market occupancy is below the 50% viability threshold.`,
    }
  } else if (rateDiffPct !== null && rateDiffPct > 20) {
    verdict = {
      tone: "warn",
      text: `⚠ Your nightly rate (£${userRate}) is ${rateDiffPct.toFixed(0)}% above the £${market.avgNightlyRate.toFixed(0)} market average. This may push your actual occupancy below the ${userOccupancyRate ?? market.avgOccupancyRate}% you've assumed.`,
    }
  } else if (userOccTooHigh) {
    verdict = {
      tone: "warn",
      text: `⚠ Your occupancy assumption (${userOccupancyRate}%) is well above the ${market.avgOccupancyRate.toFixed(0)}% market average. Stress-test cashflow at the area average before committing.`,
    }
  } else if (demand === "high") {
    verdict = {
      tone: "good",
      text: `✓ Strong SA market in ${district}. ${rateBadge?.text === "in line with market" ? "Your nightly rate is competitive." : userRate ? `Your nightly rate is ${rateBadge?.text}.` : ""} ${market.avgOccupancyRate.toFixed(0)}% area occupancy supports the income projections.`,
    }
  } else {
    verdict = {
      tone: "warn",
      text: `Moderate SA market — ${market.avgOccupancyRate.toFixed(0)}% occupancy across ${market.totalActiveListings} active listings. Workable but tighter margin for error than a high-demand area.`,
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" />
          <CardTitle className="text-sm">SA Area Intelligence</CardTitle>
          <span className="ml-auto text-xs text-muted-foreground">
            {market.marketName || district} · Source: Airroi
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* DEMAND LEVEL */}
        <section>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Demand Level
          </p>
          <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 ring-1 ${cfg.bg} ${cfg.ring}`}>
            <span className="text-base">{cfg.emoji}</span>
            <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            {market.avgOccupancyRate.toFixed(0)}% average occupancy across{" "}
            {market.totalActiveListings} active listings in this area.
          </p>
        </section>

        {/* MARKET RATES */}
        <section className="border-t border-border/40 pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Market Rates
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <Stat label="Avg Nightly Rate" value={`£${market.avgNightlyRate.toFixed(0)}`} />
            {userRate ? (
              <Stat
                label="Your Rate"
                value={`£${userRate}`}
                sub={rateBadge ? <span className={rateBadge.color}>{rateBadge.text}</span> : undefined}
              />
            ) : null}
            <Stat label="Avg Monthly Revenue" value={formatCurrency(Math.round(market.avgMonthlyRevenue))} />
            <Stat label="RevPAR" value={`£${market.revPAR.toFixed(0)}`} />
            <Stat label="Avg Stay Length" value={`${market.avgLengthOfStay.toFixed(1)} nights`} />
          </div>
        </section>

        {/* MARKET SIZE */}
        <section className="border-t border-border/40 pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Market Size
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="text-sm font-semibold text-foreground">
              {market.totalActiveListings}
            </span>{" "}
            active listings in {market.marketName || district}.{" "}
            {market.totalActiveListings > 200
              ? "Highly competitive market — differentiation matters."
              : market.totalActiveListings < 50
                ? "Less competition, but verify there's enough underlying guest demand."
                : "Healthy supply — competitive but accessible."}
          </p>
        </section>

        {/* INVESTOR VERDICT */}
        <section className="border-t border-border/40 pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Investor Verdict
          </p>
          <div
            className={`flex items-start gap-2 rounded-lg p-3 text-xs leading-relaxed ${
              verdict.tone === "good"
                ? "border border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
                : verdict.tone === "warn"
                  ? "border border-amber-500/30 bg-amber-500/5 text-amber-700"
                  : "border border-red-500/30 bg-red-500/5 text-red-700"
            }`}
          >
            {verdict.tone === "good" ? (
              <TrendingUp className="mt-0.5 size-3.5 shrink-0" />
            ) : verdict.tone === "warn" ? (
              <Minus className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            )}
            <p>{verdict.text}</p>
          </div>
        </section>

        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
          <Info className="size-3" />
          Market figures from Airroi. Verify with live Airbnb data before committing.
        </p>
      </CardContent>
    </Card>
  )
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
      {sub && <span className="text-[10px]">{sub}</span>}
    </div>
  )
}
