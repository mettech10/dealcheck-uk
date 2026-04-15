"use client"

import { useState, useCallback, useMemo } from "react"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { DealScore, getScoreColor, getScoreLabel } from "./deal-score"
import { PropertyComparables, type ComparablesLoadedData } from "./property-comparables"
import { SAComparables } from "./sa-comparables"
import { HmoComparables } from "./hmo-comparables"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts"
import type { PropertyFormData, CalculationResults, BackendResults, RiskFlag, RegionalBenchmark } from "@/lib/types"
import { formatCurrency, formatPercent, calculateDealScore, calculateAll } from "@/lib/calculations"
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PoundSterling,
  Home,
  Percent,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Loader2,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  BarChart3,
  Hammer,
  Building2,
  Users,
  Flag,
  BarChart2,
  SlidersHorizontal,
  Info,
} from "lucide-react"

interface AnalysisResultsProps {
  data: PropertyFormData
  results: CalculationResults
  aiText: string
  aiLoading: boolean
  backendData?: BackendResults | null
}

const CHART_COLORS = [
  "oklch(0.75 0.15 190)",
  "oklch(0.7 0.15 160)",
  "oklch(0.75 0.12 85)",
  "oklch(0.65 0.15 250)",
  "oklch(0.65 0.12 310)",
]

function MetricCard({
  label,
  value,
  sub,
  positive,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  positive?: boolean
  icon: React.ElementType
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-card p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="size-4 text-primary" />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={`text-lg font-semibold ${
            positive === true
              ? "text-success"
              : positive === false
              ? "text-destructive"
              : "text-foreground"
          }`}
        >
          {value}
        </span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  )
}

function parseAIAnalysis(text: string) {
  const dealScoreMatch =
    text.match(/Deal Score:\s*(\d+)/i) ||
    text.match(/⭐\s*SCORE:\s*(\d+)/i) ||
    text.match(/SCORE:\s*(\d+)/i)
  const score = dealScoreMatch ? parseInt(dealScoreMatch[1], 10) : null

  const sections: { heading: string; content: string }[] = []
  const lines = text.split("\n")
  let currentHeading = ""
  let currentContent: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^#+\s+(.+)/) || line.match(/^\*\*(.+?)\*\*/)
    if (headingMatch) {
      if (currentHeading) {
        sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() })
      }
      currentHeading = headingMatch[1].replace(/\*\*/g, "").trim()
      currentContent = []
    } else {
      currentContent.push(line)
    }
  }
  if (currentHeading) {
    sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() })
  }

  return { score, sections, rawText: text }
}

// ── Verdict Banner ─────────────────────────────────────────────────────────
function VerdictBanner({
  verdict,
  score,
  label,
}: {
  verdict?: string
  score?: number
  label?: string
}) {
  if (!verdict && score === undefined) return null

  const config =
    verdict
      ? ({
          PROCEED: {
            bg: "bg-success/10 border-success/30",
            text: "text-success",
            icon: <CheckCircle2 className="size-5" />,
            title: "Proceed",
            desc: "This deal meets investment targets. Strong fundamentals.",
          },
          REVIEW: {
            bg: "bg-warning/10 border-warning/30",
            text: "text-warning",
            icon: <AlertTriangle className="size-5" />,
            title: "Review",
            desc: "Borderline deal. Investigate further before committing.",
          },
          AVOID: {
            bg: "bg-destructive/10 border-destructive/30",
            text: "text-destructive",
            icon: <ShieldAlert className="size-5" />,
            title: "Avoid",
            desc: "Numbers don't stack up. High risk or poor returns.",
          },
        }[verdict] ?? {
          bg: "bg-muted/40 border-border/50",
          text: "text-foreground",
          icon: null,
          title: verdict,
          desc: "",
        })
      : {
          bg: "bg-muted/40 border-border/50",
          text: "text-foreground",
          icon: null,
          title: "",
          desc: "",
        }

  const displayScore = score ?? 0
  const scoreColor = getScoreColor(displayScore)
  const displayLabel = label || getScoreLabel(displayScore)

  return (
    <div className={`flex flex-col items-center gap-4 rounded-xl border px-6 py-6 ${config.bg}`}>
      {/* Circular dial + verdict side by side */}
      <div className="flex items-center gap-6">
        <DealScore score={displayScore} label={displayLabel} />
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {config.icon && <span className={config.text}>{config.icon}</span>}
            <span className="text-xl font-bold" style={{ color: scoreColor }}>
              {displayLabel}
            </span>
          </div>
          {config.desc && (
            <p className="max-w-xs text-sm text-muted-foreground">{config.desc}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Location Card ──────────────────────────────────────────────────────────
function LocationCard({ location }: { location?: BackendResults["location"] }) {
  if (!location?.council && !location?.region) return null
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <MapPin className="size-4 text-primary" />
          <CardTitle className="text-sm">Location & Council</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-6 text-sm">
          {location.country && (
            <div>
              <span className="text-muted-foreground">Country </span>
              <span className="font-medium">{location.country}</span>
            </div>
          )}
          {location.region && (
            <div>
              <span className="text-muted-foreground">Region </span>
              <span className="font-medium">{location.region}</span>
            </div>
          )}
          {location.council && (
            <div>
              <span className="text-muted-foreground">Council </span>
              <span className="font-medium">{location.council}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Article 4 Card ─────────────────────────────────────────────────────────
function Article4Card({ article4 }: { article4?: BackendResults["article_4"] }) {
  if (!article4) return null

  const isArticle4 = article4.is_article_4
  const isUnknown = article4.known === false
  const status = isArticle4 ? "restricted" : isUnknown ? "unknown" : "clear"

  const cfg = {
    restricted: {
      bg: "bg-destructive/10 border-destructive/30",
      badgeCls: "bg-destructive/20 text-destructive border-destructive/40",
      icon: <ShieldAlert className="size-4 text-destructive" />,
      label: "Article 4 in Force",
      titleCls: "text-destructive",
    },
    unknown: {
      bg: "bg-warning/10 border-warning/30",
      badgeCls: "bg-warning/20 text-warning border-warning/40",
      icon: <ShieldQuestion className="size-4 text-warning" />,
      label: "Status Unconfirmed",
      titleCls: "text-warning",
    },
    clear: {
      bg: "bg-success/10 border-success/30",
      badgeCls: "bg-success/20 text-success border-success/40",
      icon: <ShieldCheck className="size-4 text-success" />,
      label: "No Article 4 Restrictions",
      titleCls: "text-success",
    },
  }[status]

  return (
    <Card className={`border ${cfg.bg}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {cfg.icon}
          <CardTitle className={`text-sm ${cfg.titleCls}`}>Article 4 & Planning</CardTitle>
          <span className={`ml-auto rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.badgeCls}`}>
            {cfg.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {article4.note && <p className="text-muted-foreground">{article4.note}</p>}
        {article4.advice && <p className="text-foreground">{article4.advice}</p>}
        {article4.hmo_guidance && (
          <div className="rounded-lg bg-card p-3">
            <p className="mb-1 text-xs font-semibold text-foreground">HMO Guidance</p>
            <p className="text-muted-foreground">{article4.hmo_guidance}</p>
          </div>
        )}
        {article4.social_housing_suggestion && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="mb-1 text-xs font-semibold text-primary">
              Alternative: Social / Supported Housing (C3→C3b)
            </p>
            <p className="text-muted-foreground">{article4.social_housing_suggestion}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Strategy Suitability ───────────────────────────────────────────────────
function StrategySuitability({
  strategies,
}: {
  strategies?: BackendResults["strategy_recommendations"]
}) {
  if (!strategies || Object.keys(strategies).length === 0) return null

  const labels: Record<string, string> = {
    BTL: "Buy-to-Let",
    HMO: "HMO",
    BRR: "BRR",
    FLIP: "Flip",
    R2SA: "Rent-to-SA",
    SOCIAL_HOUSING: "Social Housing",
  }

  const entries = Object.entries(strategies) as [
    string,
    { suitable: boolean; note: string },
  ][]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" />
          <CardTitle className="text-sm">Strategy Suitability</CardTitle>
        </div>
        <CardDescription className="text-xs">
          How this property performs across investment strategies
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {entries.map(([key, val]) => (
            <div
              key={key}
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                val.suitable
                  ? "border-success/30 bg-success/5"
                  : "border-border/50 bg-muted/20"
              }`}
            >
              <div className="mt-0.5">
                {val.suitable ? (
                  <CheckCircle2 className="size-4 text-success" />
                ) : (
                  <AlertTriangle className="size-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground">
                  {labels[key] || key}
                </span>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {val.note}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ── House Valuation ────────────────────────────────────────────────────────
function HouseValuationCard({
  valuation,
  purchasePrice,
  avgSoldPrice,
  comparables,
  investmentType,
  userMonthlyRent,
  bedrooms,
}: {
  valuation?: BackendResults["house_valuation"]
  purchasePrice?: number
  avgSoldPrice?: number
  comparables?: ComparablesLoadedData | null
  investmentType?: string
  userMonthlyRent?: number
  bedrooms?: number
}) {
  // Priority: backend valuation estimate → backend avg_sold_price → frontend comparables average
  const backendEstimate = valuation?.estimate && valuation.estimate > 0 ? valuation.estimate : null
  const backendAvg = avgSoldPrice && avgSoldPrice > 0 ? avgSoldPrice : null
  const frontendAvg = comparables?.avgSoldPrice && comparables.avgSoldPrice > 0 ? comparables.avgSoldPrice : null

  const estimate = backendEstimate ?? backendAvg ?? frontendAvg
  const isFromComparables = !backendEstimate && !backendAvg && !!frontendAvg
  const isLoading = !valuation && !comparables // Neither data source has loaded yet

  const isHmo = investmentType === "hmo"

  // Rental data — for HMO, use user's entered monthly rent (total HMO income)
  const estRent = isHmo && userMonthlyRent && userMonthlyRent > 0
    ? userMonthlyRent
    : (comparables?.estimatedRent ?? null)
  const rentRange = isHmo ? null : (comparables?.rentRange ?? null)
  const rentLabel = isHmo ? "Est. HMO Monthly Income" : "Estimated Monthly Rent"
  const rentSubtext = isHmo && userMonthlyRent && bedrooms
    ? `${bedrooms} rooms × £${Math.round(userMonthlyRent / bedrooms)} avg room rent`
    : null

  // Gross yield — recalculate for HMO if we have the data
  const grossYield = estRent && estimate && estimate > 0
    ? ((estRent * 12) / estimate) * 100
    : (comparables?.grossYield ?? null)
  const yieldLabel = isHmo ? "Est. HMO Gross Yield" : "Gross Yield (area avg)"
  const soldCount = comparables?.soldCount ?? 0

  // Source label
  const sourceLabel = backendEstimate
    ? (valuation?.source || "PropertyData API")
    : soldCount > 0
      ? `HM Land Registry · ${soldCount} sales in last 24 months`
      : "HM Land Registry"

  // Loading state — comparables haven't loaded yet
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Home className="size-4 text-primary" />
            <CardTitle className="text-sm">House Valuation</CardTitle>
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

  // No data at all — sold comparables returned 0 results
  if (!estimate) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Home className="size-4 text-primary" />
            <CardTitle className="text-sm">House Valuation</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No external valuation available. Commission a RICS survey for an accurate figure.
          </p>
        </CardContent>
      </Card>
    )
  }

  // vs Purchase Price calculation
  const diff = purchasePrice && purchasePrice > 0 ? estimate - purchasePrice : null
  const pct = purchasePrice && purchasePrice > 0
    ? ((estimate - purchasePrice) / purchasePrice) * 100
    : null
  const isAbove = diff !== null && diff > 0
  const isBelow = diff !== null && diff < 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Home className="size-4 text-primary" />
          <CardTitle className="text-sm">House Valuation</CardTitle>
          <span className="ml-auto text-xs text-muted-foreground">
            {sourceLabel}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Row 1: Estimated value + vs purchase price */}
        <div className="flex flex-wrap items-end gap-8">
          <div>
            <p className="text-xs text-muted-foreground">Estimated Market Value</p>
            <p className="text-2xl font-bold text-foreground">
              {formatCurrency(estimate)}
            </p>
            {soldCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Based on {soldCount} recent sales in {comparables?.postcode?.split(" ")[0] || "area"}
              </p>
            )}
          </div>
          {diff !== null && pct !== null && (
            <div>
              <p className="text-xs text-muted-foreground">vs Purchase Price</p>
              <p
                className={`text-lg font-semibold ${
                  isAbove ? "text-success" : isBelow ? "text-warning" : "text-foreground"
                }`}
              >
                {pct > 0 ? "+" : ""}{pct.toFixed(1)}% {isAbove ? "above" : isBelow ? "below" : "at"} asking price
              </p>
              <p className="text-xs text-muted-foreground">
                {isAbove
                  ? `Sold prices average ${formatCurrency(diff)} above your offer`
                  : isBelow
                    ? `Sold prices average ${formatCurrency(Math.abs(diff!))} below your offer`
                    : "In line with market"}
              </p>
            </div>
          )}
        </div>

        {/* Row 2: Rent & Yield stats */}
        {(estRent || grossYield) && (
          <div className="flex flex-wrap gap-6 border-t border-border/40 pt-3">
            {estRent && (
              <div>
                <p className="text-xs text-muted-foreground">{rentLabel}</p>
                <p className="text-base font-semibold text-foreground">
                  {formatCurrency(estRent)}/mo
                </p>
                {rentSubtext && (
                  <p className="text-xs text-muted-foreground">{rentSubtext}</p>
                )}
                {rentRange && (
                  <p className="text-xs text-muted-foreground">
                    Range: {formatCurrency(rentRange.low)} – {formatCurrency(rentRange.high)}
                  </p>
                )}
              </div>
            )}
            {grossYield !== null && (
              <div>
                <p className="text-xs text-muted-foreground">{yieldLabel}</p>
                <p className={`text-base font-semibold ${grossYield >= 6 ? "text-success" : grossYield >= 4 ? "text-warning" : "text-destructive"}`}>
                  {grossYield.toFixed(2)}%
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Sold & Rent Comparables ────────────────────────────────────────────────
// Removed: SoldComparablesTable and RentComparablesTable were duplicating
// data already displayed in the PropertyComparables (Market Comparables)
// tabbed section. Data is now shown only in that tabbed section.

// ── Refurb Estimates ───────────────────────────────────────────────────────
function RefurbEstimatesCard({
  estimates,
}: {
  estimates?: BackendResults["refurb_estimates"]
}) {
  if (!estimates) return null

  const levels: {
    key: keyof NonNullable<BackendResults["refurb_estimates"]>
    label: string
    desc: string
    color: string
  }[] = [
    {
      key: "light",
      label: "Light (Cosmetic)",
      desc: "Redecorate, carpets, minor fixtures",
      color: "text-success",
    },
    {
      key: "medium",
      label: "Medium (Standard)",
      desc: "New kitchen, bathroom, replastering",
      color: "text-warning",
    },
    {
      key: "heavy",
      label: "Heavy (Full Refurb)",
      desc: "Rewire, new heating, full strip-out",
      color: "text-orange-500",
    },
    {
      key: "structural",
      label: "Structural",
      desc: "Load-bearing walls, foundations, extensions",
      color: "text-destructive",
    },
  ]

  const available = levels.filter((l) => estimates[l.key])
  if (available.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Hammer className="size-4 text-primary" />
          <CardTitle className="text-sm">Refurbishment Cost Estimates</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Based on property size and location
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {available.map(({ key, label, desc, color }) => {
            const d = estimates[key]!
            return (
              <div
                key={key}
                className="flex flex-col gap-1 rounded-lg border border-border/50 bg-muted/20 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                  <span className={`text-sm font-bold ${color}`}>
                    {formatCurrency(d.total)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{desc}</p>
                {(d.per_sqft_mid || d.per_sqm) && (
                  <p className="text-xs text-muted-foreground">
                    ~£{d.per_sqft_mid ?? d.per_sqm}/sqft
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ── AI Insights ────────────────────────────────────────────────────────────
function AIInsightsCard({
  strengths,
  risks,
  nextSteps,
  area,
}: {
  strengths?: string[]
  risks?: string[]
  nextSteps?: string[]
  area?: string
}) {
  return (
    <div className="flex flex-col gap-4">
      {strengths && strengths.length > 0 && (
        <Card className="border-success/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" />
              <CardTitle className="text-sm text-success">Strengths</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {strengths.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success" />
                  {s.replace(/^[•\-]\s*/, "").trim()}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {risks && risks.length > 0 && (
        <Card className="border-warning/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" />
              <CardTitle className="text-sm text-warning">Risks & Concerns</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {risks.map((r, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
                  {r.replace(/^[•\-]\s*/, "").trim()}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {area && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-primary" />
              <CardTitle className="text-sm">Area Analysis</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">{area}</p>
          </CardContent>
        </Card>
      )}

      {nextSteps && nextSteps.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" />
              <CardTitle className="text-sm">Recommended Next Steps</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2">
              {nextSteps.map((step, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-sm text-muted-foreground"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    {i + 1}
                  </span>
                  {step.replace(/^\d+\.\s*/, "").trim()}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Risk Flags Panel ───────────────────────────────────────────────────────
function RiskFlagsPanel({ flags }: { flags?: RiskFlag[] }) {
  if (!flags || flags.length === 0) return null

  const severityConfig = {
    HIGH: { border: "border-destructive/40", bg: "bg-destructive/5", badge: "bg-destructive/20 text-destructive border-destructive/30", dot: "bg-destructive" },
    MEDIUM: { border: "border-warning/40", bg: "bg-warning/5", badge: "bg-warning/20 text-warning border-warning/30", dot: "bg-warning" },
    LOW: { border: "border-success/40", bg: "bg-success/5", badge: "bg-success/20 text-success border-success/30", dot: "bg-success" },
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Flag className="size-4 text-primary" />
          <CardTitle className="text-sm">Risk Flags</CardTitle>
        </div>
        <CardDescription>Automated risk assessment based on deal metrics</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {flags.map((flag) => {
            const cfg = severityConfig[flag.severity] ?? severityConfig.LOW
            return (
              <div
                key={flag.id}
                className={`rounded-lg border p-4 ${cfg.border} ${cfg.bg}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`mt-0.5 size-2 shrink-0 rounded-full ${cfg.dot}`} />
                    <span className="text-sm font-semibold text-foreground">{flag.name}</span>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.badge}`}>
                    {flag.severity}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{flag.description}</p>
                {flag.mitigation && (
                  <div className="mt-2 flex items-start gap-1.5">
                    <Info className="mt-0.5 size-3 shrink-0 text-primary" />
                    <p className="text-xs text-primary/80">{flag.mitigation}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Regional Benchmark Panel ────────────────────────────────────────────────
function RegionalBenchmarkPanel({ benchmark }: { benchmark?: RegionalBenchmark }) {
  if (!benchmark) return null

  const yieldAbove = benchmark.yield_difference >= 0
  const cashflowAbove = benchmark.cashflow_difference >= 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="size-4 text-primary" />
          <CardTitle className="text-sm">Live Regional Benchmarks</CardTitle>
        </div>
        <CardDescription>
          {benchmark.region_name} · {benchmark.postcode_area} · {benchmark.data_source}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-2 gap-4">
          {/* Yield comparison */}
          <div className="rounded-lg border border-border/50 bg-card p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Gross Yield vs Regional Median</p>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-bold ${yieldAbove ? "text-success" : "text-destructive"}`}>
                {benchmark.your_yield.toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">
                {yieldAbove ? "▲" : "▼"} {Math.abs(benchmark.yield_difference).toFixed(1)}pp vs {benchmark.regional_median_yield.toFixed(1)}%
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{benchmark.yield_vs_median_label}</p>
            <div className="mt-2 overflow-hidden rounded-full bg-muted/40 h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${yieldAbove ? "bg-success" : "bg-destructive"}`}
                style={{ width: `${Math.min(100, benchmark.yield_percentile)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Top {(100 - benchmark.yield_percentile).toFixed(0)}% of area deals</p>
          </div>

          {/* Cashflow comparison */}
          <div className="rounded-lg border border-border/50 bg-card p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Cashflow vs Regional Average</p>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-bold ${cashflowAbove ? "text-success" : "text-destructive"}`}>
                £{Math.round(benchmark.your_cashflow).toLocaleString()}/mo
              </span>
              <span className="text-xs text-muted-foreground">
                {cashflowAbove ? "▲" : "▼"} £{Math.abs(Math.round(benchmark.cashflow_difference)).toLocaleString()} vs avg
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{benchmark.cashflow_vs_avg_label}</p>
            <div className="mt-2 overflow-hidden rounded-full bg-muted/40 h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${cashflowAbove ? "bg-success" : "bg-destructive"}`}
                style={{ width: `${Math.min(100, benchmark.cashflow_percentile)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Beats {benchmark.cashflow_percentile.toFixed(0)}% of comparable properties</p>
          </div>
        </div>

        {benchmark.summary && (
          <p className="rounded-md bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {benchmark.summary}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ── Sensitivity Analysis Panel ──────────────────────────────────────────────

function SensitivityAnalysisPanel({
  baseFormData,
  baseResults,
}: {
  baseFormData: PropertyFormData
  baseResults: CalculationResults
}) {
  const basePurchasePrice = baseFormData.purchasePrice ?? 0
  const [purchasePrice, setPurchasePrice] = useState<number>(basePurchasePrice)
  const [mortgageRate, setMortgageRate] = useState<number>(baseFormData.interestRate ?? 3.75)
  const [monthlyRent, setMonthlyRent] = useState<number>(baseFormData.monthlyRent ?? 0)
  const [vacancyRate, setVacancyRate] = useState<number>(
    baseFormData.voidWeeks ? Math.round((baseFormData.voidWeeks / 52) * 100 * 10) / 10 : 4.2
  )
  const [scenarioResults, setScenarioResults] = useState<CalculationResults | null>(null)

  const priceMin = Math.round(basePurchasePrice * 0.8 / 1000) * 1000
  const priceMax = Math.round(basePurchasePrice * 1.2 / 1000) * 1000

  const runSensitivity = useCallback(
    (price: number, rate: number, rent: number, vacancy: number) => {
      const voidWeeks = Math.round((vacancy / 100) * 52 * 10) / 10
      const scenarioData: PropertyFormData = {
        ...baseFormData,
        purchasePrice: price,
        interestRate: rate,
        monthlyRent: rent,
        voidWeeks,
      }
      const newResults = calculateAll(scenarioData)
      setScenarioResults(newResults)
    },
    [baseFormData]
  )

  const active = scenarioResults ?? baseResults
  const cashflow = active.monthlyCashFlow
  const yield_ = active.grossYield
  const coc = active.cashOnCashReturn
  const totalCapital = active.totalCapitalRequired
  const score = calculateDealScore(coc)
  const verdict = score >= 75 ? "PROCEED" : score >= 50 ? "REVIEW" : "AVOID"

  const verdictColor = verdict === "PROCEED" ? "text-success" : verdict === "AVOID" ? "text-destructive" : "text-warning"

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-primary" />
          <CardTitle className="text-sm">Sensitivity Analysis — What If?</CardTitle>
        </div>
        <CardDescription>Adjust key variables to stress-test this deal in real time</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          {/* ── Sliders ── */}
          <div className="flex flex-col gap-4">
            {/* Purchase Price */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Purchase Price</label>
                <span className="text-xs font-semibold text-primary">£{purchasePrice.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min={priceMin}
                max={priceMax}
                step={1000}
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground"><span>£{priceMin.toLocaleString()}</span><span>£{priceMax.toLocaleString()}</span></div>
              <p className="mt-1 text-[10px] text-muted-foreground">Adjust to model negotiation scenarios or stress-test at different price points</p>
            </div>

            {/* Mortgage Rate */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Mortgage Rate</label>
                <span className="text-xs font-semibold text-primary">{mortgageRate.toFixed(2)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={12}
                step={0.25}
                value={mortgageRate}
                onChange={(e) => setMortgageRate(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground"><span>0.5%</span><span>12%</span></div>
            </div>

            {/* Monthly Rent */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Monthly Rent</label>
                <span className="text-xs font-semibold text-primary">£{monthlyRent.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min={200}
                max={Math.max(5000, Math.round((baseFormData.monthlyRent ?? 1000) * 2))}
                step={50}
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground"><span>£200</span><span>£{Math.max(5000, Math.round((baseFormData.monthlyRent ?? 1000) * 2)).toLocaleString()}</span></div>
            </div>

            {/* Vacancy Rate */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Vacancy Rate</label>
                <span className="text-xs font-semibold text-primary">{vacancyRate.toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={25}
                step={0.5}
                value={vacancyRate}
                onChange={(e) => setVacancyRate(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground"><span>0%</span><span>25%</span></div>
            </div>
          </div>

          {/* ── Run Button ── */}
          <button
            onClick={() => runSensitivity(purchasePrice, mortgageRate, monthlyRent, vacancyRate)}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            <SlidersHorizontal className="size-4" />
            Run Scenario
          </button>

          {/* ── Scenario Results ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">Monthly Cashflow</p>
              <p className={`mt-1 text-base font-bold ${cashflow >= 0 ? "text-success" : "text-destructive"}`}>
                {cashflow >= 0 ? "+" : ""}£{Math.round(cashflow).toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">Gross Yield</p>
              <p className="mt-1 text-base font-bold text-foreground">{yield_.toFixed(2)}%</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">Cash-on-Cash</p>
              <p className="mt-1 text-base font-bold text-foreground">{coc.toFixed(2)}%</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Capital</p>
              <p className="mt-1 text-base font-bold text-foreground">£{Math.round(totalCapital).toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">Verdict</p>
              <p className={`mt-1 text-base font-bold ${verdictColor}`}>
                {verdict}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export function AnalysisResults({
  data,
  results,
  aiText,
  aiLoading,
  backendData,
}: AnalysisResultsProps) {
  const [comparablesData, setComparablesData] = useState<ComparablesLoadedData | null>(null)

  const parsedAI = parseAIAnalysis(aiText)
  const dealScore =
    backendData?.deal_score ??
    parsedAI.score ??
    calculateDealScore(results.cashOnCashReturn)

  const verdict = backendData?.verdict
  const verdictLabel = backendData?.deal_score_label

  const cashFlowData = [
    {
      name: "Monthly",
      Income: Math.round(results.monthlyIncome),
      Mortgage: Math.round(results.monthlyMortgagePayment),
      "Running Costs": Math.round(results.monthlyRunningCosts),
    },
  ]

  const costBreakdown = [
    { name: "Deposit", value: results.depositAmount },
    { name: "SDLT", value: results.sdltAmount },
    { name: "Legal", value: data.legalFees },
    { name: "Survey", value: data.surveyCosts },
    ...(data.refurbishmentBudget > 0
      ? [{ name: "Refurb", value: data.refurbishmentBudget }]
      : []),
  ].filter((item) => item.value > 0)

  const projectionData = results.fiveYearProjection.map((year) => ({
    name: `Year ${year.year}`,
    Equity: year.equity,
    "Cumulative Cash Flow": year.cumulativeCashFlow,
    "Total Return": year.totalReturn,
  }))

  const hasSoldComparables = true // Always show — PropertyComparables fetches from Land Registry
  const hasRentComparables = (backendData?.rent_comparables?.length ?? 0) > 0
  const hasRefurb = !!backendData?.refurb_estimates && Object.keys(backendData.refurb_estimates).length > 0
  const hasStrategies =
    !!backendData?.strategy_recommendations &&
    Object.keys(backendData.strategy_recommendations).length > 0
  const hasArticle4 = !!backendData?.article_4
  const hasLocation = !!(backendData?.location?.council || backendData?.location?.region)
  // Always show valuation card — it handles its own loading/empty states
  const hasValuation = true
  const hasAIInsights = !!(
    backendData?.ai_strengths?.length ||
    backendData?.ai_risks?.length ||
    backendData?.ai_next_steps?.length ||
    backendData?.ai_area
  )
  const hasRiskFlags = (backendData?.risk_flags?.length ?? 0) > 0
  const hasBenchmark = !!backendData?.regional_benchmark

  return (
    <div className="flex flex-col gap-6">

      {/* ── Verdict Banner ──────────────────────────────────────────── */}
      <VerdictBanner verdict={verdict} score={dealScore} label={verdictLabel} />

      {/* ── Key Metrics Grid ────────────────────────────────────────── */}
      {data.investmentType === "flip" ? (
        /* Flip-specific metrics */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="Net Profit"
            value={formatCurrency(results.flipNetProfit ?? 0)}
            icon={(results.flipNetProfit ?? 0) >= 0 ? TrendingUp : TrendingDown}
            positive={(results.flipNetProfit ?? 0) >= 0}
          />
          <MetricCard
            label="Flip ROI"
            value={formatPercent(results.flipROI ?? 0)}
            icon={PoundSterling}
            positive={(results.flipROI ?? 0) >= 20}
          />
          <MetricCard
            label="Gross Profit"
            value={formatCurrency(results.flipGrossProfit ?? 0)}
            sub="ARV − Purchase − Refurb"
            icon={TrendingUp}
            positive={(results.flipGrossProfit ?? 0) >= 0}
          />
          <MetricCard
            label="Selling Costs"
            value={formatCurrency(results.flipSellingCosts ?? 0)}
            sub="Agent fee + selling legal"
            icon={Home}
          />
          <MetricCard
            label="Finance Costs"
            value={formatCurrency(results.flipFinanceCosts ?? 0)}
            sub={results.bridgingLoanDetails ? `Bridging @ ${results.bridgingLoanDetails.monthlyInterestRate}%/mo` : "Interest during hold period"}
            icon={Wallet}
          />
          <MetricCard
            label="Total Capital Required"
            value={formatCurrency(results.totalCapitalRequired)}
            icon={Wallet}
          />
          <MetricCard
            label="SDLT"
            value={formatCurrency(results.sdltAmount)}
            sub={data.buyerType === "additional" ? "Incl. 5% surcharge" : "First-time buyer rate"}
            icon={Home}
          />
        </div>
      ) : (
        /* Standard metrics for BTL, BRRRR, HMO, SA */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="Gross Yield"
            value={formatPercent(results.grossYield)}
            icon={Percent}
            positive={results.grossYield >= 6}
          />
          <MetricCard
            label="Net Yield"
            value={formatPercent(results.netYield)}
            icon={Percent}
            positive={results.netYield >= 4}
          />
          <MetricCard
            label="Monthly Cash Flow"
            value={formatCurrency(results.monthlyCashFlow)}
            icon={results.monthlyCashFlow >= 0 ? TrendingUp : TrendingDown}
            positive={results.monthlyCashFlow >= 0}
          />
          <MetricCard
            label="Cash-on-Cash ROI"
            value={formatPercent(results.cashOnCashReturn)}
            icon={PoundSterling}
            positive={results.cashOnCashReturn >= 5}
          />
          <MetricCard
            label="Total Capital Required"
            value={formatCurrency(results.totalCapitalRequired)}
            sub={data.investmentType === "brr" && results.moneyLeftInDeal !== undefined
              ? `Money left in deal after refinance`
              : undefined}
            icon={Wallet}
          />
          <MetricCard
            label="SDLT"
            value={formatCurrency(results.sdltAmount)}
            sub={
              data.buyerType === "additional"
                ? "Incl. 5% surcharge"
                : "First-time buyer rate"
            }
            icon={Home}
          />
          {/* BRRRR-specific extra cards */}
          {data.investmentType === "brr" && results.refinancedMortgageAmount !== undefined && (
            <>
              <MetricCard
                label="Refinanced Mortgage"
                value={formatCurrency(results.refinancedMortgageAmount)}
                sub={`${data.depositPercentage}% LTV on ARV ${formatCurrency(data.arv || 0)}`}
                icon={Building2}
              />
              <MetricCard
                label="Equity Gained"
                value={formatCurrency(results.equityGained ?? 0)}
                sub="Forced appreciation from refurb"
                icon={TrendingUp}
                positive={(results.equityGained ?? 0) > 0}
              />
            </>
          )}
        </div>
      )}

      {/* ── Location & Council ──────────────────────────────────────── */}
      {hasLocation && <LocationCard location={backendData?.location} />}

      {/* ── House Valuation ─────────────────────────────────────────── */}
      {hasValuation && (
        <HouseValuationCard
          valuation={backendData?.house_valuation}
          purchasePrice={data.purchasePrice}
          avgSoldPrice={backendData?.avg_sold_price}
          comparables={comparablesData}
          investmentType={data.investmentType}
          userMonthlyRent={data.monthlyRent}
          bedrooms={data.bedrooms}
        />
      )}

      {/* ── Charts ──────────────────────────────────────────────────── */}
      <Tabs defaultValue="cashflow" className="w-full">
        <TabsList
          className={`w-full grid ${
            hasSoldComparables || hasRentComparables ? "grid-cols-4" : "grid-cols-3"
          }`}
        >
          <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="projection">5-Year</TabsTrigger>
          {(hasSoldComparables || hasRentComparables) && (
            <TabsTrigger value="comparables">Comparables</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="cashflow" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Cash Flow Breakdown</CardTitle>
              <CardDescription>Income vs expenses each month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cashFlowData} barGap={8}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="oklch(0.25 0.02 260)"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 12 }}
                    />
                    <YAxis
                      tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 12 }}
                      tickFormatter={(v) => `£${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "oklch(0.16 0.015 260)",
                        border: "1px solid oklch(0.25 0.02 260)",
                        borderRadius: "8px",
                        color: "oklch(0.95 0.005 260)",
                      }}
                      formatter={(value: number) => [`£${value}`, undefined]}
                    />
                    <Legend
                      wrapperStyle={{ color: "oklch(0.6 0.01 260)", fontSize: 12 }}
                    />
                    <Bar
                      dataKey="Income"
                      fill={CHART_COLORS[0]}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="Mortgage"
                      fill={CHART_COLORS[2]}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="Running Costs"
                      fill={CHART_COLORS[4]}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Capital Cost Breakdown</CardTitle>
              <CardDescription>
                Total capital: {formatCurrency(results.totalCapitalRequired)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, value }) =>
                        `${name}: £${value.toLocaleString()}`
                      }
                    >
                      {costBreakdown.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "oklch(0.16 0.015 260)",
                        border: "1px solid oklch(0.25 0.02 260)",
                        borderRadius: "8px",
                        color: "oklch(0.95 0.005 260)",
                      }}
                      formatter={(value: number) => [
                        `£${value.toLocaleString()}`,
                        undefined,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projection" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">5-Year Projection</CardTitle>
              <CardDescription>
                Assuming {data.capitalGrowthRate ?? 4}% capital growth and{" "}
                {data.annualRentIncrease}% rent increase
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={projectionData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="oklch(0.25 0.02 260)"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 12 }}
                    />
                    <YAxis
                      tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 12 }}
                      tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "oklch(0.16 0.015 260)",
                        border: "1px solid oklch(0.25 0.02 260)",
                        borderRadius: "8px",
                        color: "oklch(0.95 0.005 260)",
                      }}
                      formatter={(value: number) => [
                        `£${value.toLocaleString()}`,
                        undefined,
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ color: "oklch(0.6 0.01 260)", fontSize: 12 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Equity"
                      stroke={CHART_COLORS[0]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Cumulative Cash Flow"
                      stroke={CHART_COLORS[1]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Total Return"
                      stroke={CHART_COLORS[2]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {(hasSoldComparables || hasRentComparables) && (
          <TabsContent value="comparables" className="mt-4">
            {data.investmentType === "r2sa" ? (
              <SAComparables
                postcode={data.postcode}
                bedrooms={data.bedrooms}
              />
            ) : (
              <PropertyComparables
                postcode={data.postcode}
                bedrooms={data.bedrooms}
                currentPrice={data.purchasePrice}
                propertyType={data.propertyType}
                propertyTypeDetail={data.propertyTypeDetail}
                tenureType={data.tenureType}
                investmentType={data.investmentType}
                onDataLoaded={setComparablesData}
              />
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* ── HMO Room Rents & Area HMO Analysis (standalone, below Market Comparables) */}
      {data.investmentType === "hmo" && data.postcode && (
        <HmoComparables postcode={data.postcode} />
      )}

      {/* ── Full Financial Breakdown ─────────────────────────────────── */}
      {data.investmentType !== "r2sa" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Full Financial Breakdown</CardTitle>
            <CardDescription>Complete breakdown of all costs, income and returns</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">

            {/* ── Acquisition Costs ──────────────────────────────────── */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acquisition Costs</p>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Purchase Price</span>
                  <span className="font-semibold text-foreground">{formatCurrency(data.purchasePrice)}</span>
                </div>

                {/* SDLT with band detail */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    SDLT{data.buyerType === "first-time" ? " (first-time buyer)" : " (incl. 5% surcharge)"}
                  </span>
                  <span className="font-medium text-foreground">{formatCurrency(results.sdltAmount)}</span>
                </div>
                {results.sdltBreakdown.length > 0 && (
                  <div className="ml-4 flex flex-col gap-1 rounded-md bg-muted/30 px-3 py-2">
                    {results.sdltBreakdown.map((band) => (
                      <div key={band.band} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Band: {band.band}</span>
                        <span className="text-foreground">{formatCurrency(band.tax)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Legal Fees</span>
                  <span className="font-medium text-foreground">{formatCurrency(data.legalFees)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Survey Costs</span>
                  <span className="font-medium text-foreground">{formatCurrency(data.surveyCosts)}</span>
                </div>
                {data.refurbishmentBudget > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Refurbishment Budget</span>
                    <span className="font-medium text-foreground">{formatCurrency(data.refurbishmentBudget)}</span>
                  </div>
                )}
                <Separator className="my-1" />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Purchase Cost</span>
                  <span className="font-semibold text-foreground">{formatCurrency(results.totalPurchaseCost)}</span>
                </div>
              </div>
            </div>

            {/* ── Financing ──────────────────────────────────────────── */}
            {data.purchaseType !== "cash" && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financing</p>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Deposit ({data.depositPercentage}%)</span>
                    <span className="font-medium text-foreground">{formatCurrency(results.depositAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {data.purchaseType === "bridging-loan" ? "Bridging Loan" : "Mortgage Amount"}
                    </span>
                    <span className="font-medium text-foreground">{formatCurrency(results.mortgageAmount)}</span>
                  </div>
                  {data.purchaseType === "bridging-loan" && results.bridgingLoanDetails ? (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Monthly Interest ({data.bridgingMonthlyRate ?? 0.75}%/mo)</span>
                        <span className="font-medium text-foreground">{formatCurrency(results.bridgingLoanDetails.monthlyInterest)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Total Interest ({results.bridgingLoanDetails.termMonths} months)</span>
                        <span className="font-medium text-foreground">{formatCurrency(results.bridgingLoanDetails.totalInterest)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Arrangement Fee</span>
                        <span className="font-medium text-foreground">{formatCurrency(results.bridgingLoanDetails.arrangementFee)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Exit Fee</span>
                        <span className="font-medium text-foreground">{formatCurrency(results.bridgingLoanDetails.exitFee)}</span>
                      </div>
                      <Separator className="my-1" />
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Total Bridging Cost</span>
                        <span className="font-semibold text-foreground">{formatCurrency(results.bridgingLoanDetails.totalCost)}</span>
                      </div>
                    </>
                  ) : (
                    results.monthlyMortgagePayment > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Monthly Mortgage ({data.interestRate}% {data.mortgageType})</span>
                        <span className="font-medium text-foreground">{formatCurrency(results.monthlyMortgagePayment)}</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* ── Total Capital Required ─────────────────────────────── */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Total Capital Required</span>
                <span className="text-lg font-bold text-primary">{formatCurrency(results.totalCapitalRequired)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Deposit + SDLT + legal + survey{data.refurbishmentBudget > 0 ? " + refurb" : ""}
              </p>
            </div>

            {/* ── Monthly Income & Expenses ───────────────────────────── */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Monthly Income & Expenses</p>
              <div className="flex flex-col gap-1.5">
                {/* Income */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Gross Monthly Rent</span>
                  <span className="font-medium text-success">+{formatCurrency(data.monthlyRent)}</span>
                </div>
                {data.voidWeeks > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Void Allowance ({data.voidWeeks} weeks/yr)</span>
                    <span className="font-medium text-destructive">-{formatCurrency(Math.round((data.monthlyRent * data.voidWeeks) / 52))}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Effective Monthly Income</span>
                  <span className="font-semibold text-foreground">{formatCurrency(results.monthlyIncome)}</span>
                </div>

                <Separator className="my-1" />

                {/* Expenses */}
                {results.monthlyMortgagePayment > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Mortgage Payment</span>
                    <span className="font-medium text-destructive">-{formatCurrency(results.monthlyMortgagePayment)}</span>
                  </div>
                )}
                {data.managementFeePercent > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Management Fee ({data.managementFeePercent}%)</span>
                    <span className="font-medium text-destructive">-{formatCurrency(Math.round(data.monthlyRent * (data.managementFeePercent / 100)))}</span>
                  </div>
                )}
                {data.insurance > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Insurance</span>
                    <span className="font-medium text-destructive">-{formatCurrency(Math.round(data.insurance / 12))}</span>
                  </div>
                )}
                {data.maintenance > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Maintenance</span>
                    <span className="font-medium text-destructive">-{formatCurrency(Math.round(data.maintenance / 12))}</span>
                  </div>
                )}
                {data.groundRent > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Ground Rent</span>
                    <span className="font-medium text-destructive">-{formatCurrency(Math.round(data.groundRent / 12))}</span>
                  </div>
                )}
                {data.bills > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Bills</span>
                    <span className="font-medium text-destructive">-{formatCurrency(Math.round(data.bills / 12))}</span>
                  </div>
                )}

                <Separator className="my-1" />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Monthly Expenses</span>
                  <span className="font-semibold text-destructive">-{formatCurrency(results.monthlyExpenses)}</span>
                </div>

                <Separator className="my-1" />

                {/* Cash Flow */}
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-foreground">Monthly Cash Flow</span>
                  <span className={`text-base font-bold ${results.monthlyCashFlow >= 0 ? "text-success" : "text-destructive"}`}>
                    {results.monthlyCashFlow >= 0 ? "+" : ""}{formatCurrency(results.monthlyCashFlow)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-foreground">Annual Cash Flow</span>
                  <span className={`font-bold ${results.annualCashFlow >= 0 ? "text-success" : "text-destructive"}`}>
                    {results.annualCashFlow >= 0 ? "+" : ""}{formatCurrency(results.annualCashFlow)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Returns ─────────────────────────────────────────────── */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Returns</p>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Gross Yield</span>
                  <span className={`font-semibold ${results.grossYield >= 6 ? "text-success" : "text-foreground"}`}>{formatPercent(results.grossYield)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Net Yield</span>
                  <span className={`font-semibold ${results.netYield >= 4 ? "text-success" : "text-foreground"}`}>{formatPercent(results.netYield)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cash-on-Cash ROI</span>
                  <span className={`font-semibold ${results.cashOnCashReturn >= 5 ? "text-success" : "text-foreground"}`}>{formatPercent(results.cashOnCashReturn)}</span>
                </div>
              </div>
            </div>

          </CardContent>
        </Card>
      )}

      {/* ── Article 4 & Planning ────────────────────────────────────── */}
      {hasArticle4 && <Article4Card article4={backendData?.article_4} />}

      {/* ── Strategy Suitability ────────────────────────────────────── */}
      {hasStrategies && (
        <StrategySuitability strategies={backendData?.strategy_recommendations} />
      )}

      {/* ── Sold & Rent Comparables ─────────────────────────────────── */}
      {/* Removed: SoldComparablesTable and RentComparablesTable were
          duplicating data already shown in the Market Comparables
          tabbed section (PropertyComparables component). */}

      {/* ── HMO Rental Comparables & Area Analysis ─────────────────── */}
      {/* Standalone HmoComparables now placed above Full Financial Breakdown */}

      {/* ── Refurbishment Estimates ─────────────────────────────────── */}
      {hasRefurb && <RefurbEstimatesCard estimates={backendData?.refurb_estimates} />}

      {/* ── Risk Flags ──────────────────────────────────────────────── */}
      {hasRiskFlags && <RiskFlagsPanel flags={backendData?.risk_flags} />}

      {/* ── Regional Benchmarks ─────────────────────────────────────── */}
      {hasBenchmark && <RegionalBenchmarkPanel benchmark={backendData?.regional_benchmark} />}

      {/* ── Sensitivity Analysis (not applicable for flip — no recurring income) */}
      {data.investmentType !== "flip" && (
        <SensitivityAnalysisPanel baseFormData={data} baseResults={results} />
      )}

      {/* ── AI Insights (Strengths / Risks / Area / Next Steps) ─────── */}
      {hasAIInsights ? (
        <AIInsightsCard
          strengths={backendData?.ai_strengths}
          risks={backendData?.ai_risks}
          area={backendData?.ai_area}
          nextSteps={backendData?.ai_next_steps}
        />
      ) : (
        /* Fallback: raw AI text when no structured insights available */
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <CardTitle className="text-base">AI Investment Analysis</CardTitle>
            </div>
            <CardDescription>
              Powered by AI — reviewing your deal against market benchmarks
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aiLoading && !aiText ? (
              <div className="flex items-center gap-3 py-8 text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-primary" />
                <span className="text-sm">Analysing your deal...</span>
              </div>
            ) : (
              <div className="prose prose-sm prose-invert max-w-none">
                {parsedAI.sections.length > 0 ? (
                  parsedAI.sections.map((section, i) => (
                    <div key={i} className="mb-4">
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                        {section.heading.toLowerCase().includes("strength") ? (
                          <CheckCircle2 className="size-4 text-success" />
                        ) : section.heading.toLowerCase().includes("risk") ? (
                          <AlertTriangle className="size-4 text-warning" />
                        ) : null}
                        {section.heading}
                      </h4>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                        {section.content}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {aiText}
                    {aiLoading && (
                      <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-primary" />
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground/70">
        Metalyzi provides analytical information only, not regulated financial advice.
        Always seek independent professional advice before making investment decisions.{" "}
        <Link href="/disclaimer" className="underline hover:text-muted-foreground">
          Full disclaimer
        </Link>{" "}
        — Metusa Property Ltd, Company No. 15651934.
      </p>
    </div>
  )
}
