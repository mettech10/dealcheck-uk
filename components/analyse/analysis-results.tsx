"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { createClient as createSupabaseClient } from "@/lib/supabase/client"
import { openSupportChat } from "@/lib/crisp-context"
import {
  checkArticle4,
  type Article4CheckResult,
} from "@/lib/article4-service"
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
import { DealScorePanel } from "./deal-score-panel"
import { BRRRRResults } from "./brrrr-results"
import { FlipResults } from "./flip-results"
import { DevelopmentResults } from "./development-results"
import { AlternativeStrategiesPanel } from "./alternative-strategies-panel"
import { StrategySwitcher } from "./strategy-switcher"
import { PropertyComparables, type ComparablesLoadedData } from "./property-comparables"
import { SAComparables } from "./sa-comparables"
import { SAAreaIntelligence } from "./sa-area-intelligence"
import { HmoComparables } from "./hmo-comparables"
import { AiAreaAnalysisCard } from "./ai-area-analysis-card"
import {
  AnalyseAnotherCard,
  DealSummaryHeader,
  FiveYearProjectionCard,
  KeyMetricsStrip,
  MonthlyCashFlowCard,
  MortgageSummaryCard,
  SdltBreakdownCard,
  type StripMetric,
} from "./result-sections"
import {
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import type { PropertyFormData, CalculationResults, BackendResults, RiskFlag, RegionalBenchmark, InvestmentType } from "@/lib/types"
import { formatCurrency, formatPercent, calculateDealScore, calculateAll, estimateRefurbCost } from "@/lib/calculations"
import { scoreDeal, type ScoreResult } from "@/lib/dealScoring"
import { buildScoringInput } from "@/lib/buildScoringInput"
import {
  Home,
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
  /** Feature B — re-analyse this property under a different strategy with a
      fully-merged form (base data + modal inputs). */
  onSwitchStrategy?: (newData: PropertyFormData) => void
  /** Previous strategy for the "← Back to X" breadcrumb, if any. */
  previousStrategy?: InvestmentType | null
  onBack?: () => void
  /** Sidebar CTA card — start a fresh analysis (falls back to /analyse link). */
  onNewAnalysis?: () => void
  /** Sidebar CTA card — open the upgrade modal (falls back to /account link). */
  onUpgrade?: () => void
}

// Series colours pull from the themed --chart-* tokens so they stay
// readable in both light and dark mode (the tokens carry per-theme values).
const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

// Reusable signed-£ row used by the SA financial breakdown. Negative values
// render in red with a leading "-£"; positive values render plain (or in
// muted text when `muted` is set, e.g. for one-off capital line items).
function Row({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  const isNeg = value < 0
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${isNeg ? "text-destructive" : muted ? "text-foreground" : "text-foreground"}`}>
        {isNeg ? "-" : ""}{formatCurrency(Math.round(Math.abs(value)))}
      </span>
    </div>
  )
}

// Strategy-aware metric list for the horizontal key-metrics strip. Only
// metrics that make sense for the active strategy are emitted; anything
// dropped is reported in `omissions` so the layout logger can surface it.
function buildStripMetrics(
  data: PropertyFormData,
  results: CalculationResults,
): { items: StripMetric[]; omissions: string[] } {
  const omissions: string[] = []
  const strategy = data.investmentType

  if (strategy === "development") {
    omissions.push(
      "key-metrics-strip: development metrics covered by the feasibility panel",
    )
    return { items: [], omissions }
  }

  if (strategy === "flip") {
    omissions.push("monthly-rent/yield strip metrics: not applicable to flip")
    return {
      items: [
        { label: "Purchase Price", value: formatCurrency(data.purchasePrice) },
        { label: "SDLT", value: formatCurrency(results.sdltAmount) },
        { label: "Total Capital", value: formatCurrency(results.totalCapitalRequired) },
        {
          label: "Gross Profit",
          value: formatCurrency(results.flipGrossProfit ?? 0),
          positive: (results.flipGrossProfit ?? 0) >= 0,
        },
        {
          label: "Net Profit",
          value: formatCurrency(results.flipNetProfit ?? 0),
          positive: (results.flipNetProfit ?? 0) >= 0,
        },
        {
          label: "Flip ROI",
          value: formatPercent(results.flipROI ?? 0),
          positive: (results.flipROI ?? 0) >= 20,
        },
        { label: "Finance Costs", value: formatCurrency(results.flipFinanceCosts ?? 0) },
        { label: "Selling Costs", value: formatCurrency(results.flipSellingCosts ?? 0) },
      ],
      omissions,
    }
  }

  if (strategy === "r2sa") {
    const isOwned = data.saOwnershipType === "own"
    const monthlyRevenue = results.monthlyIncome
    const occ = data.saOccupancyRate ?? 0
    const items: StripMetric[] = [
      {
        label: "Monthly Revenue",
        value: formatCurrency(monthlyRevenue),
        sub: occ > 0 ? `At ${occ}% occupancy` : undefined,
        positive: monthlyRevenue > 0,
      },
      {
        label: "Monthly Net Profit",
        value: formatCurrency(results.monthlyCashFlow),
        positive: results.monthlyCashFlow >= 0,
      },
      { label: "Annual Revenue", value: formatCurrency(Math.round(monthlyRevenue * 12)) },
      { label: "Total Capital", value: formatCurrency(results.totalCapitalRequired) },
    ]
    if (isOwned) {
      items.push(
        { label: "Purchase Price", value: formatCurrency(data.purchasePrice) },
        { label: "SDLT", value: formatCurrency(results.sdltAmount) },
        {
          label: "Gross Yield",
          value: formatPercent(results.grossYield),
          positive: results.grossYield >= 8,
        },
        {
          label: "Net Yield",
          value: formatPercent(results.netYield),
          positive: results.netYield >= 4,
        },
      )
    } else {
      const nightly = data.saNightlyRate ?? 0
      const breakevenOcc =
        nightly > 0 ? ((results.monthlyExpenses ?? 0) / (nightly * 30)) * 100 : 0
      const leaseRent = data.saMonthlyLease || data.monthlyRent || 0
      const revToRent = leaseRent > 0 ? monthlyRevenue / leaseRent : 0
      items.push(
        {
          label: "Break-even Occ.",
          value:
            breakevenOcc > 0 && breakevenOcc < 200
              ? `${breakevenOcc.toFixed(1)}%`
              : "—",
          sub: "Min to cover all costs",
          positive: breakevenOcc > 0 && breakevenOcc < occ,
        },
        {
          label: "Revenue : Rent",
          value: revToRent > 0 ? `${revToRent.toFixed(2)}×` : "—",
          sub: "Target 2.0× or better",
          positive: revToRent >= 2,
        },
      )
      omissions.push(
        "purchase-price/SDLT/yield strip metrics: rent-to-SA has no purchase",
      )
    }
    return { items, omissions }
  }

  // Standard rental strategies — BTL, BRRRR, HMO
  const y5 = results.fiveYearProjection[results.fiveYearProjection.length - 1]
  const fiveYrRoi =
    y5 && results.totalCapitalRequired > 0
      ? (y5.totalReturn / results.totalCapitalRequired) * 100
      : undefined
  return {
    items: [
      { label: "Purchase Price", value: formatCurrency(data.purchasePrice) },
      { label: "SDLT", value: formatCurrency(results.sdltAmount) },
      { label: "Total Acquisition", value: formatCurrency(results.totalPurchaseCost) },
      { label: "Monthly Rent", value: formatCurrency(data.monthlyRent) },
      {
        label: "Gross Yield",
        value: formatPercent(results.grossYield),
        positive: results.grossYield >= 6,
      },
      {
        label: "Net Yield",
        value: formatPercent(results.netYield),
        positive: results.netYield >= 4,
      },
      {
        label: "Monthly Cash Flow",
        value: formatCurrency(results.monthlyCashFlow),
        positive: results.monthlyCashFlow >= 0,
      },
      fiveYrRoi !== undefined
        ? {
            label: "5-Yr ROI",
            value: formatPercent(fiveYrRoi),
            positive: fiveYrRoi >= 0,
          }
        : {
            label: "Cash-on-Cash",
            value: formatPercent(results.cashOnCashReturn),
            positive: results.cashOnCashReturn >= 5,
          },
    ],
    omissions,
  }
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
//
// Queries the Metalyzi Supabase `article4_areas` table via the browser
// anon client. Falls back to the Flask backend's legacy `article_4`
// advice text when the lookup can't resolve the postcode.
//
// Embeds a compact Leaflet mini-map (200px) showing the council centres
// for matched areas — loaded via next/dynamic so Leaflet doesn't touch
// `window` during SSR.
const Article4MiniMap = dynamic(
  () => import("@/components/article4/Article4Map"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[200px] w-full items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
        Loading map…
      </div>
    ),
  }
)

// Planning-route guidance keyed off the development construction type.
// New-build / extension almost always need Full Planning Permission;
// conversions may have permitted-development rights via Class MA (commercial→
// residential) or Class Q (agricultural→residential) but with strict criteria;
// refurbishment alone is typically minor works only.
const DEV_PLANNING_ROUTE: Record<
  string,
  { label: string; route: string; detail: string; tone: "info" | "warn" }
> = {
  "new-build-traditional": {
    label: "New build (traditional)",
    route: "Full Planning Permission required",
    detail:
      "Greenfield/brownfield new-build typically requires a full PP application (8–13 weeks at the LPA, longer if called in). Budget design+planning fees of 6–10% of build cost and expect S106 / CIL contributions on schemes of 10+ units.",
    tone: "warn",
  },
  "new-build-timber-frame": {
    label: "New build (timber frame)",
    route: "Full Planning Permission required",
    detail:
      "Same PP route as traditional new-build — the structural method does not change planning consent requirements. NHBC / LABC warranty cover is essential for lender acceptance on resale.",
    tone: "warn",
  },
  "new-build-modular": {
    label: "New build (modular / MMC)",
    route: "Full Planning Permission required",
    detail:
      "Modular construction follows the standard PP route. Some LPAs view MMC favourably for sustainability scoring, but condition discharge can still trigger delays — confirm cladding and fire-safety standards (Building Safety Act) at submission.",
    tone: "warn",
  },
  conversion: {
    label: "Change-of-use conversion",
    route: "Possible Permitted Development (Class MA / Class Q) — verify",
    detail:
      "Commercial→residential conversions may use Class MA (E-class to C3) with a Prior Approval, subject to size cap (≤1,500 m² per building) and 2-year vacancy rule. Agricultural→residential uses Class Q (≤5 dwellings, ≤865 m²). Many LPAs have removed PD rights via Article 4 — always run a Prior Approval check before exchanging.",
    tone: "info",
  },
  extension: {
    label: "Extension / upward development",
    route: "Householder PP or Class A/AA Permitted Development",
    detail:
      "Single-storey rear extensions may fall under Class A PD (subject to size limits and neighbour consultation). Upward extensions (Class AA) allow 1–2 storeys on existing dwellings with Prior Approval. Anything outside these envelopes needs full Householder PP.",
    tone: "info",
  },
  refurbishment: {
    label: "Internal refurbishment",
    route: "Building Regs only (typically no planning needed)",
    detail:
      "Pure internal refurb without change of use, external alteration, or extension generally needs only Building Regulations approval. Listed buildings, conservation areas, and HMO conversions (C3→C4) override this — verify locally.",
    tone: "info",
  },
}

function Article4Card({
  postcode,
  legacy,
  investmentType,
  devConstructionType,
}: {
  postcode?: string
  legacy?: BackendResults["article_4"]
  investmentType?: string
  devConstructionType?: string
}) {
  const [result, setResult] = useState<Article4CheckResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!postcode) {
      setLoading(false)
      return
    }
    ;(async () => {
      try {
        const supabase = createSupabaseClient()
        const r = await checkArticle4(supabase, postcode)
        if (!cancelled) setResult(r)
      } catch {
        // Fail-soft — keep result null, fall through to legacy/unknown.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [postcode])

  // Derive a 3-state display: active / proposed / clear / unknown.
  // A missing result (no postcode or lookup failed) → unknown.
  const status: "active" | "proposed" | "clear" | "unknown" = !result
    ? "unknown"
    : result.status === "active"
    ? "active"
    : result.status === "proposed"
    ? "proposed"
    : result.status === "none"
    ? "clear"
    : "unknown"

  const cfg = {
    active: {
      bg: "bg-destructive/10 border-destructive/30",
      badgeCls: "bg-destructive/20 text-destructive border-destructive/40",
      icon: <ShieldAlert className="size-4 text-destructive" />,
      label: "Article 4 in Force",
      titleCls: "text-destructive",
    },
    proposed: {
      bg: "bg-warning/10 border-warning/30",
      badgeCls: "bg-warning/20 text-warning border-warning/40",
      icon: <ShieldAlert className="size-4 text-warning" />,
      label: "Article 4 Proposed",
      titleCls: "text-warning",
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

  const showMap =
    status === "active" || status === "proposed"
      ? result?.areas.some(
          (a) =>
            a.approximateCenterLat != null && a.approximateCenterLng != null
        )
      : false

  const subject =
    showMap && result
      ? (() => {
          const first = result.areas.find(
            (a) =>
              a.approximateCenterLat != null && a.approximateCenterLng != null
          )
          return first
            ? {
                lat: first.approximateCenterLat as number,
                lng: first.approximateCenterLng as number,
                label: `${result.district ?? ""} area`,
              }
            : null
        })()
      : null

  return (
    <Card className={`border ${cfg.bg}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {cfg.icon}
          <CardTitle className={`text-sm ${cfg.titleCls}`}>
            Article 4 & Planning
          </CardTitle>
          <span
            className={`ml-auto rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.badgeCls}`}
          >
            {cfg.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Checking Article 4 database…
          </div>
        )}

        {!loading && result && (
          <p className="text-foreground">{result.summary}</p>
        )}

        {!loading && !result && legacy?.note && (
          <p className="text-muted-foreground">{legacy.note}</p>
        )}

        {/* Matched council areas */}
        {!loading && result && result.areas.length > 0 && (
          <div className="flex flex-col gap-2">
            {result.areas.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border bg-card p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-foreground">
                    {a.councilName}
                  </p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${
                      a.status === "active"
                        ? "bg-destructive/20 text-destructive border-destructive/40"
                        : "bg-warning/20 text-warning border-warning/40"
                    }`}
                  >
                    {a.status}
                  </span>
                </div>
                {a.directionType && (
                  <p className="mt-1 text-muted-foreground">
                    {a.directionType}
                  </p>
                )}
                {a.impactDescription && (
                  <p className="mt-1 text-muted-foreground">
                    {a.impactDescription}
                  </p>
                )}
                {a.effectiveDate && a.status === "active" && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Effective: {a.effectiveDate}
                  </p>
                )}
                {a.consultationEndDate && a.status !== "active" && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Consultation ends: {a.consultationEndDate}
                  </p>
                )}
                {a.councilPlanningUrl && (
                  <a
                    href={a.councilPlanningUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    View council planning page ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Embedded mini-map for active/proposed */}
        {!loading && showMap && subject && (
          <div className="rounded-lg overflow-hidden border">
            <Article4MiniMap
              subject={subject}
              height={200}
              compact
            />
          </div>
        )}

        {/* HMO guidance — show only when active and strategy is HMO-relevant.
            For development schemes we suppress this in favour of the
            construction-type-specific Development Planning Route block below. */}
        {status === "active" && investmentType !== "development" && (
          <div className="rounded-lg bg-card p-3">
            <p className="mb-1 text-xs font-semibold text-foreground">
              HMO Guidance
            </p>
            <p className="text-muted-foreground">
              C3→C4 HMO conversion in this area requires full planning
              permission — not permitted development. Budget for an 8–13
              week planning application and additional professional fees.
              Consider an alternative strategy (BTL, supported housing) or
              a different postcode.
            </p>
          </div>
        )}

        {/* Development Planning Route — only shown for development schemes.
            Maps the user's selected devConstructionType to the most likely
            consent pathway (Full PP, Class MA / Class Q PD, householder PD,
            or Building Regs-only) so the investor sees the right call before
            committing capital. Article 4 status above takes precedence: an
            active direction can strip back PD rights even on conversions. */}
        {!loading && investmentType === "development" && (() => {
          const route =
            (devConstructionType && DEV_PLANNING_ROUTE[devConstructionType]) ||
            null
          if (!route) {
            return (
              <div className="rounded-lg bg-card p-3">
                <p className="mb-1 text-xs font-semibold text-foreground">
                  Development Planning Route
                </p>
                <p className="text-muted-foreground">
                  Select a construction type on the input form to see the
                  expected planning consent pathway for this scheme.
                </p>
              </div>
            )
          }
          const toneCls =
            route.tone === "warn"
              ? "border-warning/30 bg-warning/5"
              : "border-primary/30 bg-primary/5"
          return (
            <div className={`rounded-lg border p-3 ${toneCls}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">
                  Development Planning Route
                </p>
                <span className="rounded-full border border-border/60 bg-card px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  {route.label}
                </span>
              </div>
              <p className="text-foreground">{route.route}</p>
              <p className="mt-1 text-muted-foreground">{route.detail}</p>
              {status === "active" && (
                <p className="mt-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
                  Article 4 is in force at this postcode — assume any permitted
                  development rights above are restricted or removed. Confirm
                  the exact direction with the LPA before relying on a Prior
                  Approval route.
                </p>
              )}
            </div>
          )
        })()}

        {/* Legacy Flask advice — only shown if we couldn't run the lookup */}
        {!loading && !result && legacy?.advice && (
          <p className="text-foreground">{legacy.advice}</p>
        )}
        {!loading && !result && legacy?.hmo_guidance && (
          <div className="rounded-lg bg-card p-3">
            <p className="mb-1 text-xs font-semibold text-foreground">
              HMO Guidance
            </p>
            <p className="text-muted-foreground">{legacy.hmo_guidance}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
          <span>
            Always verify with the local planning authority before
            proceeding.
          </span>
          <a
            href="/article4-map"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            <MapPin className="size-3" />
            Full UK map
          </a>
        </div>
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
  roomCount,
  avgRoomRate,
  postcode,
}: {
  valuation?: BackendResults["house_valuation"]
  purchasePrice?: number
  avgSoldPrice?: number
  comparables?: ComparablesLoadedData | null
  investmentType?: string
  userMonthlyRent?: number
  bedrooms?: number
  roomCount?: number
  avgRoomRate?: number
  postcode?: string
}) {
  // Fetch SpareRoom / PropertyData room listings for HMO to derive avg room rent
  const isHmoCard = investmentType === "hmo"
  const [spareRoomAvg, setSpareRoomAvg] = useState<number | null>(null)
  const [spareRoomCount, setSpareRoomCount] = useState<number>(0)
  const [spareRoomSource, setSpareRoomSource] = useState<string>("")
  useEffect(() => {
    if (!isHmoCard || !postcode) return
    console.log("[HMO ROOMS FROM FORM] roomCount:", roomCount, "avgRoomRate:", avgRoomRate, "bedrooms:", bedrooms)
    fetch(`/api/comparables/spareroom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcode: postcode.toUpperCase(), maxResults: 12 }),
    })
      .then((r) => r.json())
      .then((data) => {
        const listings: Array<{ rentPcm?: number | null; monthly_rent?: number; price_pcm?: number }> =
          data?.listings || []
        const prices = listings
          .map((l) => l.rentPcm ?? l.monthly_rent ?? l.price_pcm ?? null)
          .filter((p): p is number => typeof p === "number" && p > 0)
        console.log("[HMO AVG RENT] source:", data?.source, "listings:", prices.length, "avg:", prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : null)
        if (prices.length > 0) {
          setSpareRoomAvg(prices.reduce((s, p) => s + p, 0) / prices.length)
          setSpareRoomCount(prices.length)
          setSpareRoomSource(data?.source === "propertydata" ? "PropertyData market data" : `${prices.length} SpareRoom listings`)
        }
      })
      .catch((err) => console.error("[HMO AVG RENT] fetch error:", err))
  }, [isHmoCard, postcode, roomCount, avgRoomRate, bedrooms])

  // Priority: backend valuation estimate → backend avg_sold_price → frontend comparables average
  const backendEstimate = valuation?.estimate && valuation.estimate > 0 ? valuation.estimate : null
  const backendAvg = avgSoldPrice && avgSoldPrice > 0 ? avgSoldPrice : null
  const frontendAvg = comparables?.avgSoldPrice && comparables.avgSoldPrice > 0 ? comparables.avgSoldPrice : null

  const estimate = backendEstimate ?? backendAvg ?? frontendAvg
  const isFromComparables = !backendEstimate && !backendAvg && !!frontendAvg
  const isLoading = !valuation && !comparables // Neither data source has loaded yet

  const isHmo = investmentType === "hmo"

  // HMO income: use form roomCount × (SpareRoom avg → user's entered avgRoomRate)
  const hmoRooms = roomCount ?? bedrooms ?? 0
  const hmoAvgRent = spareRoomAvg ?? (avgRoomRate && avgRoomRate > 0 ? avgRoomRate : null)
  const hmoIncome = isHmo && hmoRooms > 0 && hmoAvgRent
    ? Math.round(hmoRooms * hmoAvgRent)
    : null
  const hmoRentSource = spareRoomAvg
    ? `from ${spareRoomSource || `${spareRoomCount} SpareRoom listings`}`
    : "your entered rate"

  // Rental data — for HMO, prefer SpareRoom-derived income; fall back to user's monthly rent
  const estRent = isHmo
    ? (hmoIncome ?? (userMonthlyRent && userMonthlyRent > 0 ? userMonthlyRent : null))
    : (comparables?.estimatedRent ?? null)
  const rentRange = isHmo ? null : (comparables?.rentRange ?? null)
  const rentLabel = isHmo ? "Est. HMO Monthly Income" : "Estimated Monthly Rent"
  const rentSubtext = isHmo && hmoRooms > 0 && hmoAvgRent
    ? `${hmoRooms} rooms × £${Math.round(hmoAvgRent)} avg room rent (${hmoRentSource})`
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
  sqft,
  condition,
  propertyType,
  postcode,
}: {
  sqft?: number
  condition?: string
  propertyType?: string
  postcode?: string
}) {
  console.log("[REFURB CARD] sqft:", sqft, "condition:", condition, "propertyType:", propertyType, "postcode:", postcode)

  // Match form Select values exactly (property-form.tsx):
  // excellent | good | cosmetic | full-refurb | structural
  const tiers: {
    key: string
    label: string
    desc: string
    rateSqft: number
    color: string
  }[] = [
    { key: "excellent",   label: "Excellent / Move-in Ready",   desc: "No work needed",                                  rateSqft: 0,    color: "text-muted-foreground" },
    { key: "good",        label: "Good — Minor Cosmetic",       desc: "Redecorate, carpets, minor fixtures",             rateSqft: 12.5, color: "text-success" },
    { key: "cosmetic",    label: "Needs Cosmetic Work",         desc: "New kitchen/bathroom, replastering",              rateSqft: 25,   color: "text-warning" },
    { key: "full-refurb", label: "Needs Full Refurbishment",    desc: "Rewire, new heating, full strip-out",             rateSqft: 50,   color: "text-orange-500" },
    { key: "structural",  label: "Structural / Major Works",    desc: "Load-bearing walls, foundations, extensions",     rateSqft: 87.5, color: "text-destructive" },
  ]

  const validSqft = typeof sqft === "number" && sqft > 0 ? sqft : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Hammer className="size-4 text-primary" />
          <CardTitle className="text-sm">Refurbishment Cost Estimates</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {validSqft
            ? `Based on ${validSqft.toLocaleString()} sqft floor size · all condition types shown`
            : "Enter floor size for accurate estimates"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {tiers.map(({ key, label, desc, rateSqft, color }) => {
            const isSelected = condition === key
            // Use the same calculation pipeline as the form auto-fill
            // (applies property-type and regional multipliers).
            const cost = validSqft
              ? estimateRefurbCost(validSqft, key, propertyType || "house", postcode)
              : 0
            return (
              <div
                key={key}
                className={`flex flex-col gap-1 rounded-lg border p-3 transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border/50 bg-muted/20"
                } ${!validSqft ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                  <span className={`text-sm font-bold ${color}`}>
                    {validSqft ? formatCurrency(cost) : "—"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{desc}</p>
                <p className="text-xs text-muted-foreground">~£{rateSqft}/sqft base rate</p>
                {isSelected && (
                  <span className="mt-1 inline-flex w-fit items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    Selected condition ✓
                  </span>
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
  const strategy = baseFormData.investmentType ?? "btl"
  const isBRRRR = strategy === "brr"
  const isFlip  = strategy === "flip"

  const basePurchasePrice  = baseFormData.purchasePrice ?? 0
  const baseARV            = baseFormData.arv ?? Math.round(basePurchasePrice * 1.2 / 1000) * 1000
  const baseRefurb         = baseFormData.refurbishmentBudget ?? 0
  const baseBridgingRate   = baseFormData.bridgingMonthlyRate ?? 0.75

  const [purchasePrice,  setPurchasePrice]  = useState<number>(basePurchasePrice)
  const [mortgageRate,   setMortgageRate]   = useState<number>(baseFormData.interestRate ?? 3.75)
  const [monthlyRent,    setMonthlyRent]    = useState<number>(baseFormData.monthlyRent ?? 0)
  const [vacancyRate,    setVacancyRate]    = useState<number>(
    baseFormData.voidWeeks ? Math.round((baseFormData.voidWeeks / 52) * 100 * 10) / 10 : 4.2
  )
  // BRRRR + Flip extra sliders
  const [arv,            setArv]            = useState<number>(baseARV)
  const [refurbCost,     setRefurbCost]     = useState<number>(baseRefurb)
  // Flip-only
  const [bridgingRate,   setBridgingRate]   = useState<number>(baseBridgingRate)

  const [scenarioResults, setScenarioResults] = useState<CalculationResults | null>(null)

  const priceMin   = Math.round(basePurchasePrice * 0.8 / 1000) * 1000
  const priceMax   = Math.round(basePurchasePrice * 1.2 / 1000) * 1000
  const arvMin     = Math.round(baseARV * 0.7 / 1000) * 1000
  const arvMax     = Math.round(baseARV * 1.4 / 1000) * 1000
  const refurbMin  = 0
  const refurbMax  = Math.max(50000, Math.round(baseRefurb * 2 / 1000) * 1000)

  const runSensitivity = useCallback(() => {
    const voidWeeks = Math.round((vacancyRate / 100) * 52 * 10) / 10
    const scenarioData: PropertyFormData = {
      ...baseFormData,
      purchasePrice,
      interestRate: mortgageRate,
      monthlyRent,
      voidWeeks,
      ...(isBRRRR || isFlip ? { arv, refurbBudget: refurbCost } : {}),
      ...(isFlip ? { bridgingMonthlyRate: bridgingRate } : {}),
    }
    setScenarioResults(calculateAll(scenarioData))
  }, [baseFormData, purchasePrice, mortgageRate, monthlyRent, vacancyRate, arv, refurbCost, bridgingRate, isBRRRR, isFlip])

  const active      = scenarioResults ?? baseResults
  const cashflow    = active.monthlyCashFlow
  const yield_      = active.grossYield
  const coc         = active.cashOnCashReturn
  const totalCapital = active.totalCapitalRequired
  const score       = calculateDealScore(coc)
  const verdict     = score >= 75 ? "PROCEED" : score >= 50 ? "REVIEW" : "AVOID"
  const verdictColor = verdict === "PROCEED" ? "text-success" : verdict === "AVOID" ? "text-destructive" : "text-warning"

  function Slider({
    label, value, min, max, step, format, onChange, hint,
  }: {
    label: string; value: number; min: number; max: number; step: number
    format: (v: number) => string; onChange: (v: number) => void; hint?: string
  }) {
    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-foreground">{label}</label>
          <span className="text-xs font-semibold text-primary">{format(value)}</span>
        </div>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{format(min)}</span><span>{format(max)}</span>
        </div>
        {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
      </div>
    )
  }

  const gbp = (v: number) => `£${Math.round(v).toLocaleString()}`
  const pct = (v: number) => `${v.toFixed(2)}%`

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
          <div className="flex flex-col gap-4">
            <Slider label="Purchase Price" value={purchasePrice} min={priceMin} max={priceMax} step={1000}
              format={gbp} onChange={setPurchasePrice}
              hint="Model negotiation scenarios or stress-test at different price points" />

            {!isFlip && (
              <Slider label="Mortgage Rate" value={mortgageRate} min={0.5} max={12} step={0.25}
                format={pct} onChange={setMortgageRate} />
            )}

            {!isFlip && !isBRRRR && (
              <Slider label="Monthly Rent" value={monthlyRent}
                min={200} max={Math.max(5000, Math.round((baseFormData.monthlyRent ?? 1000) * 2))} step={50}
                format={gbp} onChange={setMonthlyRent} />
            )}

            {!isFlip && !isBRRRR && (
              <Slider label="Vacancy Rate" value={vacancyRate} min={0} max={25} step={0.5}
                format={(v) => `${v.toFixed(1)}%`} onChange={setVacancyRate} />
            )}

            {/* BRRRR + Flip: ARV slider */}
            {(isBRRRR || isFlip) && (
              <Slider label="After Repair Value (ARV)" value={arv} min={arvMin} max={arvMax} step={2500}
                format={gbp} onChange={setArv}
                hint="Model optimistic or conservative post-refurb valuations" />
            )}

            {/* BRRRR + Flip: Refurb Cost slider */}
            {(isBRRRR || isFlip) && (
              <Slider label="Refurb Cost" value={refurbCost} min={refurbMin} max={refurbMax} step={1000}
                format={gbp} onChange={setRefurbCost}
                hint="Stress-test if works run over budget" />
            )}

            {/* Flip only: Bridging Rate slider */}
            {isFlip && (
              <Slider label="Bridging Monthly Rate" value={bridgingRate} min={0.5} max={2} step={0.05}
                format={(v) => `${v.toFixed(2)}%/mo`} onChange={setBridgingRate}
                hint="Affects total bridging interest and net profit" />
            )}
          </div>

          <button
            onClick={runSensitivity}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            <SlidersHorizontal className="size-4" />
            Run Scenario
          </button>

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
              <p className={`mt-1 text-base font-bold ${verdictColor}`}>{verdict}</p>
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
  onSwitchStrategy,
  previousStrategy,
  onBack,
  onNewAnalysis,
  onUpgrade,
}: AnalysisResultsProps) {
  const [comparablesData, setComparablesData] = useState<ComparablesLoadedData | null>(null)
  // Strategy targeted by the Alternative-panel "Switch →" buttons; opens the
  // switcher's mini-form modal (Feature B).
  const [switchTarget, setSwitchTarget] = useState<InvestmentType | null>(null)

  const parsedAI = parseAIAnalysis(aiText)

  // New unified multi-factor scorer (lib/dealScoring.ts) — replaces the
  // backend single-axis dealScore + verdictLabel. Computed client-side so
  // it can see Article 4 / benchmark / comparables alongside form inputs.
  const scoreResult: ScoreResult = useMemo(
    () => scoreDeal(buildScoringInput(data, results, backendData ?? undefined)),
    [data, results, backendData],
  )
  const dealScore = scoreResult.total
  const verdict = backendData?.verdict
  const verdictLabel = scoreResult.label

  const costBreakdown = [
    { name: "Deposit", value: results.depositAmount },
    { name: "SDLT", value: results.sdltAmount },
    { name: "Legal", value: data.legalFees },
    { name: "Survey", value: data.surveyCosts },
    ...(data.refurbishmentBudget > 0
      ? [{ name: "Refurb", value: data.refurbishmentBudget }]
      : []),
  ].filter((item) => item.value > 0)

  const hasSoldComparables = true // Always show — PropertyComparables fetches from Land Registry
  const hasRentComparables = (backendData?.rent_comparables?.length ?? 0) > 0
  const hasStrategies =
    !!backendData?.strategy_recommendations &&
    Object.keys(backendData.strategy_recommendations).length > 0
  const hasLocation = !!(backendData?.location?.council || backendData?.location?.region)
  // Always show valuation card — it handles its own loading/empty states
  const hasValuation = true
  // Structured AI insights (strengths / risks / next steps) render as their
  // own cards; the narrative card carries ai_verdict (or the raw aiText
  // fallback) — shown whenever there's a verdict or nothing structured to
  // fall back on, mirroring the old either/or behaviour.
  const hasStructuredInsights = !!(
    backendData?.ai_strengths?.length ||
    backendData?.ai_risks?.length ||
    backendData?.ai_next_steps?.length
  )
  const showNarrativeCard = !!backendData?.ai_verdict || !hasStructuredInsights
  const hasRiskFlags = (backendData?.risk_flags?.length ?? 0) > 0
  const hasBenchmark = !!backendData?.regional_benchmark

  // ── New-layout derived data ─────────────────────────────────────────
  const { items: stripMetrics, omissions: stripOmissions } = useMemo(
    () => buildStripMetrics(data, results),
    [data, results],
  )

  // Flip/development have no meaningful 5-year rental projection.
  const showProjection =
    data.investmentType !== "flip" &&
    data.investmentType !== "development" &&
    results.fiveYearProjection.length > 0

  // "Benchmarked vs …" tag on the AI narrative card — best available source.
  const pb = backendData?.postcode_benchmark
  const comparableCount =
    (backendData?.sold_comparables?.length ?? 0) +
    (backendData?.rent_comparables?.length ?? 0)
  const benchmarkTag = pb?.transaction_count_12m
    ? `Benchmarked vs ${pb.transaction_count_12m.toLocaleString()} ${pb.postcode_district} transactions`
    : backendData?.regional_benchmark
    ? `Benchmarked vs ${backendData.regional_benchmark.region_name} regional data`
    : comparableCount > 0
    ? `Benchmarked vs ${comparableCount} local comparables`
    : null

  const verdictHeadline =
    verdict === "PROCEED"
      ? "Proceed — this deal meets investment targets."
      : verdict === "REVIEW"
      ? "Review — borderline deal, investigate further before committing."
      : verdict === "AVOID"
      ? "Avoid — numbers don't stack up; high risk or poor returns."
      : undefined

  // Per-analysis record of which layout sections were omitted and why, so
  // missing-data behaviour can be reviewed per strategy (Section 4 of the
  // layout spec). Info-level: this is expected behaviour, not an error.
  useEffect(() => {
    const omitted = [...stripOmissions]
    if (!showProjection)
      omitted.push("five-year-projection: not applicable to strategy or no data")
    if (results.sdltAmount <= 0) omitted.push("sdlt-breakdown: no SDLT due")
    if (data.purchaseType === "cash" || results.mortgageAmount <= 0)
      omitted.push("mortgage-summary: cash purchase or no loan")
    if (results.monthlyIncome <= 0)
      omitted.push("monthly-cash-flow-chart: no monthly income for strategy")
    if (!hasRiskFlags) omitted.push("risk-flags: none returned by backend")
    if (!benchmarkTag) omitted.push("ai-benchmark-tag: no benchmark data")
    console.info(
      `[results-layout] strategy=${data.investmentType} — omitted sections:`,
      omitted.length > 0 ? omitted : "none",
    )
  }, [
    data.investmentType,
    data.purchaseType,
    stripOmissions,
    showProjection,
    results.sdltAmount,
    results.mortgageAmount,
    results.monthlyIncome,
    hasRiskFlags,
    benchmarkTag,
  ])

  return (
    /* `print-results-root` is the wrapper isolated by body.print-results
       in globals.css → when the user hits "Save as PDF" the whole results
       tree (cards, charts, AI sections, area analysis, comparables…)
       renders to PDF exactly as it appears on screen. Each card already
       has its own border + page-break-inside: avoid via the print rules. */
    <div className="flex flex-col gap-6 print-results-root">

      {/* ── Strategy Switch Toggle (Feature B) ──────────────────────── */}
      {/* Sits above the deal score dial so users can re-analyse the same
          property under a different strategy. `switchTarget` lets the
          Alternative-panel "Switch →" buttons open this same modal. */}
      {onSwitchStrategy && (
        <StrategySwitcher
          data={data}
          backendData={backendData}
          onSwitch={onSwitchStrategy}
          backStrategy={previousStrategy}
          onBack={onBack}
          externalTarget={switchTarget}
          onExternalTargetHandled={() => setSwitchTarget(null)}
        />
      )}

      {/* ── A. Deal summary header row ──────────────────────────────── */}
      <DealSummaryHeader data={data} score={dealScore} label={verdictLabel} />

      {/* ── B. Key metrics strip — strategy-aware ───────────────────── */}
      <KeyMetricsStrip items={stripMetrics} />

      {/* ── C. Two-column body — sidebar stacks below on mobile ─────── */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── Left column — main content ─────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-6">

      {/* ── AI Analysis narrative — verdict + benchmark tag ─────────── */}
      {showNarrativeCard && (
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <CardTitle className="text-base">AI Analysis</CardTitle>
              </div>
              {benchmarkTag && (
                <span className="rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {benchmarkTag}
                </span>
              )}
            </div>
            {verdictHeadline && <CardDescription>{verdictHeadline}</CardDescription>}
          </CardHeader>
          <CardContent>
            {backendData?.ai_verdict ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {backendData.ai_verdict}
              </p>
            ) : aiLoading && !aiText ? (
              <div className="flex items-center gap-3 py-6 text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-primary" />
                <span className="text-sm">Analysing your deal...</span>
              </div>
            ) : !aiText && parsedAI.sections.length === 0 ? (
              // No insights at all — show an explicit message so the user
              // knows AI generation failed, instead of seeing a blank card.
              <div className="flex flex-col items-start gap-3 py-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="size-4 text-warning" />
                  AI insights couldn&apos;t be generated for this analysis.
                </div>
                <p className="text-xs text-muted-foreground/80">
                  This usually clears on a retry. Re-run the analysis or
                  reload the saved deal to fetch fresh commentary.
                </p>
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

      {/* ── Structured AI insights — strengths / risks / next steps ─── */}
      {hasStructuredInsights && (
        <AIInsightsCard
          strengths={backendData?.ai_strengths}
          risks={backendData?.ai_risks}
          nextSteps={backendData?.ai_next_steps}
        />
      )}

      {/* ── Unified Deal Score Panel ────────────────────────────────── */}
      {/* Renders critical flag banners (hard-cap triggers + soft
          warnings), score dial, colour-coded label, and collapsible
          category breakdown.                                          */}
      <DealScorePanel result={scoreResult} />




      {/* ── BRRRR-specific 8-display panel ─────────────────────────── */}
      {data.investmentType === "brr" && (
        <BRRRRResults data={data} results={results} backendData={backendData} />
      )}

      {/* ── Flip-specific 8-display panel ──────────────────────────── */}
      {data.investmentType === "flip" && (
        <FlipResults data={data} results={results} backendData={backendData} />
      )}

      {/* ── Development-specific feasibility panel ─────────────────── */}
      {data.investmentType === "development" && (
        <DevelopmentResults data={data} results={results} backendData={backendData} />
      )}




      {/* ── 5-Year Projection — toggle chart + year table ───────────── */}
      {showProjection && (
        <FiveYearProjectionCard
          projection={results.fiveYearProjection}
          capitalGrowthRate={data.capitalGrowthRate}
          annualRentIncrease={data.annualRentIncrease}
        />
      )}

      {/* ── SDLT Breakdown — collapsed accordion, expands to bands ──── */}
      <SdltBreakdownCard
        amount={results.sdltAmount}
        breakdown={results.sdltBreakdown}
        buyerType={data.buyerType}
      />

      {/* ── Full Financial Breakdown — SA / R2SA ────────────────────── */}
      {data.investmentType === "r2sa" && (() => {
        const isSAOwned = data.saOwnershipType === "own"
        const monthlyRevenue = results.monthlyIncome
        const annualRevenue = monthlyRevenue * 12
        const occupancy = data.saOccupancyRate ?? 0
        const platformPct = data.saPlatformFeePercent ?? 15
        const platformCost = monthlyRevenue * (platformPct / 100)
        const cleaningPerStay = data.saCleaningCostPerStay ?? 0
        const stays = data.saAvgStaysPerMonth ?? 0
        const cleaningCost = cleaningPerStay * stays
        const utilities = data.saUtilitiesMonthly ?? 0
        const insuranceMonthly = (data.saInsuranceAnnual ?? 0) / 12
        const mgmtPct = data.saManagementFeePercent ?? 0
        const mgmtCost = monthlyRevenue * (mgmtPct / 100)
        const maintPct = data.saMaintenancePercent ?? 0
        const maintCost = monthlyRevenue * (maintPct / 100)
        const leaseCost = !isSAOwned ? (data.saMonthlyLease || data.monthlyRent || 0) : 0
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Full Financial Breakdown</CardTitle>
              <CardDescription>
                Serviced Accommodation · {isSAOwned ? "owned" : "rent-to-SA"} model
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">

              {/* REVENUE */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Revenue</p>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Monthly Revenue {occupancy > 0 ? `(at ${occupancy}% occupancy)` : ""}
                    </span>
                    <span className="font-medium text-success">+{formatCurrency(monthlyRevenue)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Annual Revenue</span>
                    <span className="font-medium text-success">+{formatCurrency(Math.round(annualRevenue))}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* PLATFORM & OPERATIONAL COSTS */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform & Operational Costs</p>
                <div className="flex flex-col gap-1.5">
                  <Row label={`Platform Commission (${platformPct}%)`}                                value={-platformCost} />
                  <Row label={`Cleaning (${stays.toFixed(1)} stays × £${cleaningPerStay})`}            value={-cleaningCost} />
                  <Row label="Utilities (monthly)"                                                     value={-utilities} />
                  <Row label="Insurance (monthly)"                                                     value={-insuranceMonthly} />
                  <Row label={`SA Management Fee (${mgmtPct}%)`}                                       value={-mgmtCost} />
                  <Row label={`Maintenance (${maintPct}%)`}                                            value={-maintCost} />
                </div>
              </div>

              {/* FINANCING / LEASE */}
              {isSAOwned && results.monthlyMortgagePayment > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financing</p>
                  <Row label={`Monthly Mortgage (${data.interestRate}% ${data.mortgageType})`} value={-results.monthlyMortgagePayment} />
                </div>
              )}
              {!isSAOwned && leaseCost > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lease Cost</p>
                  <Row label="Monthly Rent / Lease" value={-leaseCost} />
                </div>
              )}

              <Separator />

              {/* TOTALS */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Monthly Costs</span>
                  <span className="font-semibold text-destructive">-{formatCurrency(results.monthlyExpenses)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-foreground">Monthly Net Profit</span>
                  <span className={`text-base font-bold ${results.monthlyCashFlow >= 0 ? "text-success" : "text-destructive"}`}>
                    {results.monthlyCashFlow >= 0 ? "+" : ""}{formatCurrency(results.monthlyCashFlow)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-foreground">Annual Net Profit</span>
                  <span className={`font-bold ${results.annualCashFlow >= 0 ? "text-success" : "text-destructive"}`}>
                    {results.annualCashFlow >= 0 ? "+" : ""}{formatCurrency(results.annualCashFlow)}
                  </span>
                </div>
              </div>

              {/* CAPITAL (owned only) */}
              {isSAOwned && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Capital</p>
                    <div className="flex flex-col gap-1.5">
                      <Row label={`Deposit (${data.depositPercentage}%)`} value={results.depositAmount} muted />
                      <Row label="SDLT" value={results.sdltAmount} muted />
                      <Row label="Legal Fees" value={data.legalFees} muted />
                      <Row label="Survey" value={data.surveyCosts} muted />
                      {/* Refurb is added to totalCapitalRequired by the calc engine
                          (lib/calculations.ts SA-Owned branch). Without showing this
                          line, the components didn't tie to the displayed Total. */}
                      {(data.refurbishmentBudget ?? 0) > 0 && (
                        <Row label="Refurbishment Budget" value={data.refurbishmentBudget ?? 0} muted />
                      )}
                      {(data.saSetupCosts ?? 0) > 0 && (
                        <Row label="SA Setup Costs" value={data.saSetupCosts ?? 0} muted />
                      )}
                      <Separator className="my-1" />
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-foreground">Total Capital Required</span>
                        <span className="font-bold text-primary">{formatCurrency(results.totalCapitalRequired)}</span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* RETURNS (owned only) */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Returns</p>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Gross Yield</span>
                        <span className={`font-semibold ${results.grossYield >= 8 ? "text-success" : "text-foreground"}`}>{formatPercent(results.grossYield)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Net Yield</span>
                        <span className={`font-semibold ${results.netYield >= 4 ? "text-success" : "text-foreground"}`}>{formatPercent(results.netYield)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">ROI (Cash-on-Cash)</span>
                        <span className={`font-semibold ${results.cashOnCashReturn >= 8 ? "text-success" : "text-foreground"}`}>{formatPercent(results.cashOnCashReturn)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {!isSAOwned && (() => {
                const annualInsurance = data.saInsuranceAnnual ?? 0
                const furnitureSetup = data.saSetupCosts ?? 0
                const rentDeposit = leaseCost * 2
                const advanceRent = leaseCost
                const utilitiesSetup = utilities * 2
                const initialCleaning = cleaningPerStay * 3
                console.log("[SA COST BREAKDOWN]", {
                  monthlyRevenue,
                  platformFee: platformCost,
                  cleaning: cleaningCost,
                  monthlyRent: leaseCost,
                  utilities,
                  monthlyInsurance: insuranceMonthly,
                  management: mgmtCost,
                  maintenance: maintCost,
                  totalMonthlyCosts: results.monthlyExpenses,
                  monthlyNetProfit: results.monthlyCashFlow,
                  totalCapital: results.totalCapitalRequired,
                  capitalParts: { rentDeposit, advanceRent, utilitiesSetup, annualInsurance, initialCleaning, furnitureSetup },
                })
                return (
                  <>
                    <Separator />
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Capital (one-off)</p>
                      <div className="flex flex-col gap-1.5">
                        <Row label="Rent Deposit (2 months)" value={rentDeposit} muted />
                        <Row label="Advance Rent (1 month)" value={advanceRent} muted />
                        <Row label="Utilities Setup (deposit + 1st month)" value={utilitiesSetup} muted />
                        <Row label="Annual Insurance (upfront)" value={annualInsurance} muted />
                        <Row label="Initial Cleaning Supplies" value={initialCleaning} muted />
                        {furnitureSetup > 0 && (
                          <Row label="Furniture & Setup" value={furnitureSetup} muted />
                        )}
                        <Separator className="my-1" />
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-foreground">Total Capital Required</span>
                          <span className="font-bold text-primary">{formatCurrency(results.totalCapitalRequired)}</span>
                        </div>
                      </div>
                    </div>

                    <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      Rent-to-SA model — gross/net yield are not applicable (no purchase).
                      ROI on capital required:{" "}
                      <span className={`font-semibold ${results.cashOnCashReturn >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatPercent(results.cashOnCashReturn)}
                      </span>
                    </p>
                  </>
                )
              })()}
            </CardContent>
          </Card>
        )
      })()}

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
                {/* Maintenance — calc engine prefers maintenancePercent
                    of (void-adjusted) annual rent when > 0, else falls
                    back to the flat annual maintenance amount. The row
                    was previously gated on data.maintenance > 0 only,
                    so when the user had a non-zero maintenancePercent
                    and zero flat amount the line disappeared from the
                    breakdown while still being deducted from cashflow. */}
                {(data.maintenancePercent > 0 || data.maintenance > 0) && (() => {
                  const voidFactor = (52 - (data.voidWeeks ?? 0)) / 52
                  const monthlyMaint =
                    data.maintenancePercent > 0
                      ? data.monthlyRent * (data.maintenancePercent / 100) * voidFactor
                      : data.maintenance / 12
                  const label =
                    data.maintenancePercent > 0
                      ? `Maintenance (${data.maintenancePercent}% of rent)`
                      : "Maintenance"
                  return (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium text-destructive">
                        -{formatCurrency(Math.round(monthlyMaint))}
                      </span>
                    </div>
                  )
                })()}
                {data.groundRent > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Ground Rent</span>
                    <span className="font-medium text-destructive">-{formatCurrency(Math.round(data.groundRent / 12))}</span>
                  </div>
                )}
                {data.bills > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Bills</span>
                    <span className="font-medium text-destructive">-{formatCurrency(Math.round(data.bills))}</span>
                  </div>
                )}
                {/* HMO licence — calc engine amortises hmoLicenceCost over
                    hmoLicenceTermYears (default 5) and folds it into
                    running costs for HMO strategy. Was deducted from
                    cashflow but never shown on this breakdown. */}
                {data.investmentType === "hmo"
                  && (data.hmoLicenceCost ?? 0) > 0
                  && (() => {
                    const termYears =
                      data.hmoLicenceTermYears && data.hmoLicenceTermYears > 0
                        ? data.hmoLicenceTermYears
                        : 5
                    const monthlyAmort = (data.hmoLicenceCost ?? 0) / termYears / 12
                    return (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          HMO Licence ({formatCurrency(data.hmoLicenceCost ?? 0)} over {termYears}yr)
                        </span>
                        <span className="font-medium text-destructive">
                          -{formatCurrency(Math.round(monthlyAmort))}
                        </span>
                      </div>
                    )
                  })()}

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

        </div>

        {/* ── Right column — sidebar ─────────────────────────────────── */}
        <div className="flex flex-col gap-6">
          {/* Mortgage / bridging summary — hidden for cash purchases */}
          <MortgageSummaryCard data={data} results={results} />

          {/* Monthly cash flow bars — rent → costs → net */}
          <MonthlyCashFlowCard data={data} results={results} />

          {/* Risk flags — one row per flag with severity badge */}
          {hasRiskFlags && <RiskFlagsPanel flags={backendData?.risk_flags} />}

          {/* Analyse-another CTA with plan/usage note */}
          <AnalyseAnotherCard onNewAnalysis={onNewAnalysis} onUpgrade={onUpgrade} />
        </div>
      </div>

      {/* ── Tools CTA strip ─────────────────────────────────────────── */}
      {/* Cross-link to the standalone tools so users naturally flow
          from analysis → portfolio tracking and comparison.         */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 bg-card/40 px-4 py-3 text-sm print:hidden">
        <span className="text-muted-foreground">Next steps:</span>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/tools/portfolio?prefill=${encodeURIComponent(JSON.stringify({
              address: data.address,
              postcode: data.postcode,
              purchase_price: data.purchasePrice,
              monthly_rent: data.monthlyRent,
              strategy: (data.investmentType || "btl").toUpperCase(),
            }))}`}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
          >
            Add to portfolio →
          </Link>
          <Link
            href="/tools/compare"
            className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-400"
          >
            Compare with another deal →
          </Link>
        </div>
      </div>

      {/* ── Alternative Strategies Panel (Feature A) ───────────────── */}
      {/* Rough client-side estimates for the other strategies so users
          can compare exits at a glance and jump to a full re-analysis. */}
      <AlternativeStrategiesPanel
        data={data}
        results={results}
        backendData={backendData}
        onSwitch={onSwitchStrategy ? (s) => setSwitchTarget(s) : undefined}
      />

      {/* ── Location & Council ──────────────────────────────────────── */}
      {hasLocation && <LocationCard location={backendData?.location} />}

      {/* ── SA Area Intelligence (replaces House Valuation for r2sa) ── */}
      {data.investmentType === "r2sa" && data.postcode && (
        <SAAreaIntelligence
          postcode={data.postcode}
          bedrooms={data.bedrooms}
          userNightlyRate={data.saNightlyRate}
          userOccupancyRate={data.saOccupancyRate}
        />
      )}

      {/* ── House Valuation ─────────────────────────────────────────── */}
      {hasValuation && data.investmentType !== "r2sa" && (
        <HouseValuationCard
          valuation={backendData?.house_valuation}
          purchasePrice={data.purchasePrice}
          avgSoldPrice={backendData?.avg_sold_price}
          comparables={comparablesData}
          investmentType={data.investmentType}
          userMonthlyRent={data.monthlyRent}
          bedrooms={data.bedrooms}
          roomCount={data.roomCount}
          avgRoomRate={data.avgRoomRate}
          postcode={data.postcode}
        />
      )}

      {/* ── Market data — costs pie + comparables ───────────────────── */}
      {/* Cash-flow and 5-year tabs removed: superseded by the sidebar
          Monthly Cash Flow chart and the 5-Year Projection card.      */}
      <Tabs defaultValue="costs" className="w-full">
        <TabsList
          className={`w-full grid ${
            hasSoldComparables || hasRentComparables ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          <TabsTrigger value="costs">Costs</TabsTrigger>
          {(hasSoldComparables || hasRentComparables) && (
            <TabsTrigger value="comparables">Comparables</TabsTrigger>
          )}
        </TabsList>

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
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        color: "var(--foreground)",
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

        {(hasSoldComparables || hasRentComparables) && (
          <TabsContent value="comparables" className="mt-4">
            {/* SA: single scroll view — SA Market Data + Nightly Rate
                Comparables. No sold/rental/room sub-tabs (irrelevant for
                short-let). All other strategies get the standard
                PropertyComparables with sold/rental/room sub-tabs. */}
            {data.investmentType === "r2sa" ? (
              data.postcode ? (
                <SAComparables
                  postcode={data.postcode}
                  bedrooms={data.bedrooms}
                />
              ) : (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
                  Add a postcode to load SA market data and nightly-rate comparables.
                </p>
              )
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

      {/* ── HMO Room Rents & Area HMO Analysis ──────────────────────── */}
      {data.investmentType === "hmo" && data.postcode && (
        <HmoComparables postcode={data.postcode} />
      )}

      {/* ── Article 4 & Planning ────────────────────────────────────── */}
      {/* Always rendered — the card checks the Metalyzi Article 4 database
          itself using data.postcode, so it works even if the Flask backend
          didn't return article_4 (legacy field passed as fallback advice). */}
      <Article4Card
        postcode={data.postcode}
        legacy={backendData?.article_4}
        investmentType={data.investmentType}
        devConstructionType={data.devConstructionType}
      />

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
      <RefurbEstimatesCard
        sqft={data.sqft}
        condition={data.condition}
        propertyType={data.propertyType}
        postcode={data.postcode}
      />


      {/* ── Regional Benchmarks ─────────────────────────────────────── */}
      {hasBenchmark && <RegionalBenchmarkPanel benchmark={backendData?.regional_benchmark} />}

      {/* ── Sensitivity Analysis ────────────────────────────────────── */}
      <SensitivityAnalysisPanel baseFormData={data} baseResults={results} />

      {/* ── AI Area Analysis — strategy-aware 5-section card ──────────── */}
      {/* Threads strategy-specific signals (ARV, room rates, SA nightly,
          DEV unit mix etc) into the Flask Claude prompt so each strategy
          gets section titles and analytical lens calibrated to that
          strategy's investor questions — not a one-size BTL-style report. */}
      {data.postcode && (
        <AiAreaAnalysisCard
          postcode={data.postcode}
          strategy={data.investmentType}
          dealData={{
            purchasePrice: data.purchasePrice,
            grossYield: results.grossYield,
            monthlyCashFlow: results.monthlyCashFlow,
            cashOnCashReturn: results.cashOnCashReturn,
            bedrooms: data.bedrooms,
            sqft: data.sqft,
            propertyType: data.propertyType,
            propertyTypeDetail: data.propertyTypeDetail,
            tenureType: data.tenureType,
            condition: data.condition,
            refurbishmentBudget: data.refurbishmentBudget,
            // Strategy-specific extras — Flask uses these to enrich the prompt
            arv: data.arv,
            arvBasis: data.arvBasis,
            // HMO
            roomCount: data.roomCount,
            avgRoomRate: data.avgRoomRate,
            hmoLicenceCost: data.hmoLicenceCost,
            // BRRRR
            brrrrCapitalRecycledPct: results.brrrrCapitalRecycledPct,
            brrrrRefurbUpliftRatio: results.brrrrRefurbUpliftRatio,
            moneyLeftInDeal: results.moneyLeftInDeal,
            equityGained: results.equityGained,
            refinancedMortgageAmount: results.refinancedMortgageAmount,
            // Flip
            flipPostTaxProfit: results.flipPostTaxProfit,
            flipPostTaxROI: results.flipPostTaxROI,
            flipPassesStrict70: results.flipPassesStrict70,
            flipHoldingMonths: data.flipHoldingMonths,
            flipOwnershipStructure: data.flipOwnershipStructure,
            // SA / R2SA
            saOwnershipType: data.saOwnershipType,
            saNightlyRate: data.saNightlyRate,
            saOccupancyRate: data.saOccupancyRate,
            saMonthlyLease: data.saMonthlyLease,
            // Development
            devSiteType: data.devSiteType,
            devPlanningStatus: data.devPlanningStatus,
            devUnitMixSize: Array.isArray(data.devUnitMix) ? data.devUnitMix.length : 0,
            devTotalUnits: Array.isArray(data.devUnitMix)
              ? data.devUnitMix.reduce((s, u) => s + (Number(u.numberOfUnits) || 0), 0)
              : 0,
            devGdv: results.development?.totalGDV,
            devTdc: results.development?.totalDevelopmentCost,
            devProfitOnCostPct: results.development?.profitOnCost,
            devRlv: results.development?.residualLandValue,
          }}
          benchmark={(backendData?.regional_benchmark || backendData?.postcode_benchmark) as Record<string, unknown> | null | undefined}
          articleFour={backendData?.article_4 as Record<string, unknown> | null | undefined}
          marketContext={{
            soldComparables: backendData?.sold_comparables ?? null,
            rentComparables: backendData?.rent_comparables ?? null,
            avgSoldPrice: backendData?.avg_sold_price ?? null,
            houseValuation: backendData?.house_valuation ?? null,
          }}
          fallbackText={backendData?.ai_area}
        />
      )}


      {/* Report-an-issue — opens Crisp pre-filled with the deal
          context so the user doesn't have to re-type which analysis
          they're asking about. */}
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={() =>
            openSupportChat(
              `I have an issue with my analysis:\n\n` +
                `• Strategy: ${data.investmentType ?? "—"}\n` +
                `• Address: ${data.address ?? "—"}\n` +
                `• Postcode: ${data.postcode ?? "—"}\n` +
                `• Purchase Price: £${(data.purchasePrice ?? 0).toLocaleString()}\n\n` +
                `Issue: [describe your issue]`,
            )
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-transparent px-3.5 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
        >
          <span aria-hidden>🐛</span>
          Report an issue with this analysis
        </button>
      </div>

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
