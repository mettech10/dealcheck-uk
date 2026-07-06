"use client"

/**
 * Result-page layout sections — the structural building blocks for the
 * restructured analysis result page:
 *
 *   DealSummaryHeader     — property meta line + AI deal score card (top row)
 *   KeyMetricsStrip       — single horizontal card of strategy-aware metrics
 *   FiveYearProjectionCard— line chart (Cash Flow ⇄ Equity toggle) + Y1–Y5 table
 *   SdltBreakdownCard     — collapsed accordion row, expands to SDLT bands
 *   MortgageSummaryCard   — sidebar financing summary
 *   MonthlyCashFlowCard   — sidebar bar chart (rent → costs → net)
 *   AnalyseAnotherCard    — sidebar CTA with plan/usage note
 *
 * All colours come from the existing theme tokens (--chart-*, --primary,
 * text-success/-warning/-destructive, Card/border styles) — no new colours.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowRight, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { getScoreColor } from "./deal-score"
import type {
  CalculationResults,
  PropertyFormData,
  YearProjection,
} from "@/lib/types"
import { formatCurrency, formatPercent } from "@/lib/calculations"

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--foreground)",
}

// ── A. Deal summary header row ─────────────────────────────────────────────

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  "semi-detached": "Semi-detached",
  detached: "Detached",
  terraced: "Terraced",
  "end-terrace": "End-terrace",
  bungalow: "Bungalow",
  cottage: "Cottage",
  house: "House",
  flat: "Flat",
  commercial: "Commercial",
}

export function DealSummaryHeader({
  data,
  score,
  label,
  analysedAt,
}: {
  data: PropertyFormData
  score: number
  label: string
  analysedAt?: string | Date | null
}) {
  const typeLabel =
    PROPERTY_TYPE_LABEL[data.propertyTypeDetail ?? ""] ??
    PROPERTY_TYPE_LABEL[data.propertyType] ??
    "Property"
  const date = analysedAt ? new Date(analysedAt) : new Date()
  const dateLabel = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const scoreColor = getScoreColor(score)
  const badgeClass =
    score >= 75
      ? "bg-success/10 text-success border-success/30"
      : score >= 50
      ? "bg-warning/10 text-warning border-warning/30"
      : "bg-destructive/10 text-destructive border-destructive/30"

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Deal Analysis
        </p>
        <p className="text-sm text-muted-foreground">
          {typeLabel}
          {data.bedrooms > 0 && <> · {data.bedrooms} bed</>}
          {" · "}Analysed {dateLabel}
        </p>
      </div>

      {/* AI Deal Score card — top-right of the header row */}
      <div className="flex min-w-[180px] flex-col items-center gap-1.5 rounded-xl border border-border/50 bg-card px-6 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          AI Deal Score
        </p>
        <p className="leading-none">
          <span className="text-4xl font-bold" style={{ color: scoreColor }}>
            {score}
          </span>
          <span className="ml-1 text-sm text-muted-foreground">/100</span>
        </p>
        <span
          className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${badgeClass}`}
        >
          {label}
        </span>
      </div>
    </div>
  )
}

// ── B. Key metrics strip ───────────────────────────────────────────────────

export interface StripMetric {
  label: string
  value: string
  sub?: string
  /** true → success tint, false → destructive tint, undefined → plain */
  positive?: boolean
}

export function KeyMetricsStrip({ items }: { items: StripMetric[] }) {
  if (items.length === 0) return null
  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5 py-5 sm:grid-cols-4 lg:grid-cols-8">
        {items.map((m) => (
          <div key={m.label} className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {m.label}
            </span>
            <span
              className={`text-lg font-semibold leading-tight ${
                m.positive === true
                  ? "text-success"
                  : m.positive === false
                  ? "text-destructive"
                  : "text-foreground"
              }`}
            >
              {m.value}
            </span>
            {m.sub && (
              <span className="text-xs text-muted-foreground">{m.sub}</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ── C-left. 5-Year projection (toggle chart + year table) ──────────────────

export function FiveYearProjectionCard({
  projection,
  capitalGrowthRate,
  annualRentIncrease,
}: {
  projection: YearProjection[]
  capitalGrowthRate?: number
  annualRentIncrease?: number
}) {
  const [view, setView] = useState<"cashflow" | "equity">("cashflow")
  if (!projection || projection.length === 0) return null

  const chartData = projection.map((y) => ({
    name: `Y${y.year}`,
    "Annual Cash Flow": Math.round(y.annualCashFlow),
    "Cumulative Cash Flow": Math.round(y.cumulativeCashFlow),
    Equity: Math.round(y.equity),
  }))

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">5-Year Projection</CardTitle>
            <CardDescription>
              Assuming {capitalGrowthRate ?? 4}% capital growth
              {annualRentIncrease !== undefined &&
                ` and ${annualRentIncrease}% rent increase`}
            </CardDescription>
          </div>
          {/* Cash Flow ⇄ Equity toggle */}
          <div className="flex rounded-lg border border-border/50 bg-muted/30 p-0.5">
            {(
              [
                ["cashflow", "Cash flow"],
                ["equity", "Equity"],
              ] as const
            ).map(([key, lbl]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  view === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="name"
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value: number) => [
                  `£${value.toLocaleString()}`,
                  undefined,
                ]}
              />
              {/* NOTE: recharts ignores children wrapped in fragments —
                  each Line must be a direct (conditional) child.      */}
              {view === "cashflow" && (
                <Line
                  type="monotone"
                  dataKey="Annual Cash Flow"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              )}
              {view === "cashflow" && (
                <Line
                  type="monotone"
                  dataKey="Cumulative Cash Flow"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              )}
              {view === "equity" && (
                <Line
                  type="monotone"
                  dataKey="Equity"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Year-by-year table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4 font-semibold">Year</th>
                <th className="py-2 pr-4 font-semibold">Annual Rent</th>
                <th className="py-2 pr-4 font-semibold">Cash Flow</th>
                <th className="py-2 pr-4 font-semibold">Cumulative CF</th>
                <th className="py-2 font-semibold">Equity</th>
              </tr>
            </thead>
            <tbody>
              {projection.map((y) => (
                <tr key={y.year} className="border-b border-border/30 last:border-0">
                  <td className="py-2 pr-4 text-muted-foreground">Y{y.year}</td>
                  <td className="py-2 pr-4 text-foreground">
                    {formatCurrency(Math.round(y.annualRent))}
                  </td>
                  <td
                    className={`py-2 pr-4 font-medium ${
                      y.annualCashFlow >= 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {formatCurrency(Math.round(y.annualCashFlow))}
                  </td>
                  <td className="py-2 pr-4 text-foreground">
                    {formatCurrency(Math.round(y.cumulativeCashFlow))}
                  </td>
                  <td className="py-2 font-medium text-foreground">
                    {formatCurrency(Math.round(y.equity))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ── C-left. SDLT breakdown accordion ───────────────────────────────────────

export function SdltBreakdownCard({
  amount,
  breakdown,
  buyerType,
}: {
  amount: number
  breakdown: { band: string; tax: number }[]
  buyerType?: PropertyFormData["buyerType"]
}) {
  if (amount <= 0) return null
  return (
    <Card className="py-0">
      <Accordion type="single" collapsible>
        <AccordionItem value="sdlt" className="border-0 px-6">
          <AccordionTrigger className="py-4 hover:no-underline">
            <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              SDLT Breakdown
            </span>
            <span className="ml-auto mr-2 text-sm font-bold text-foreground">
              {formatCurrency(amount)} due
            </span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-1.5 pb-4">
            <p className="mb-1 text-xs text-muted-foreground">
              {buyerType === "first-time"
                ? "First-time buyer rates applied."
                : buyerType === "additional"
                ? "Includes 5% additional-property surcharge."
                : "Standard residential rates applied."}
            </p>
            {breakdown.map((band) => (
              <div
                key={band.band}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">Band: {band.band}</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(band.tax)}
                </span>
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  )
}

// ── C-right. Mortgage summary card ─────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/30 py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

export function MortgageSummaryCard({
  data,
  results,
}: {
  data: PropertyFormData
  results: CalculationResults
}) {
  if (data.purchaseType === "cash" || results.mortgageAmount <= 0) return null

  const isBridging =
    data.purchaseType === "bridging-loan" && results.bridgingLoanDetails

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {isBridging ? "Bridging Summary" : "Mortgage Summary"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        <SummaryRow
          label="Property value"
          value={formatCurrency(data.purchasePrice)}
        />
        <SummaryRow
          label={`Deposit (${data.depositPercentage}%)`}
          value={formatCurrency(results.depositAmount)}
        />
        <SummaryRow
          label={isBridging ? "Bridging loan" : "Loan amount"}
          value={formatCurrency(results.mortgageAmount)}
        />
        <SummaryRow label="LTV" value={`${100 - data.depositPercentage}%`} />
        {isBridging && results.bridgingLoanDetails ? (
          <>
            <SummaryRow
              label={`Rate (${results.bridgingLoanDetails.monthlyInterestRate}%/mo)`}
              value={formatCurrency(results.bridgingLoanDetails.monthlyInterest) + "/mo"}
            />
            <SummaryRow
              label={`Total interest (${results.bridgingLoanDetails.termMonths} months)`}
              value={formatCurrency(results.bridgingLoanDetails.totalInterest)}
            />
            <SummaryRow
              label="Total bridging cost"
              value={formatCurrency(results.bridgingLoanDetails.totalCost)}
            />
          </>
        ) : (
          <>
            <SummaryRow
              label={`Rate (${data.mortgageType})`}
              value={formatPercent(data.interestRate)}
            />
            <SummaryRow
              label="Monthly payment"
              value={formatCurrency(results.monthlyMortgagePayment)}
            />
            <SummaryRow
              label="Annual interest"
              value={formatCurrency(results.annualMortgageCost)}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── C-right. Monthly cash flow bar chart ───────────────────────────────────

export function MonthlyCashFlowCard({
  data,
  results,
}: {
  data: PropertyFormData
  results: CalculationResults
}) {
  if (results.monthlyIncome <= 0) return null

  const agent = Math.round(
    data.monthlyRent * ((data.managementFeePercent || 0) / 100),
  )
  const reserve = Math.max(
    0,
    Math.round(results.monthlyRunningCosts) - agent,
  )
  const net = Math.round(results.monthlyCashFlow)

  const bars = [
    { name: "Rent", value: Math.round(results.monthlyIncome), fill: "var(--chart-1)" },
    { name: "Mortgage", value: Math.round(results.monthlyMortgagePayment), fill: "var(--chart-3)" },
    { name: "Agent", value: agent, fill: "var(--chart-4)" },
    { name: "Reserve", value: reserve, fill: "var(--chart-5)" },
    { name: "Net", value: net, fill: "var(--chart-2)" },
  ].filter((b) => b.name === "Net" || b.value > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Monthly Cash Flow
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars}>
              <XAxis
                dataKey="name"
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value: number) => [
                  `£${value.toLocaleString()}`,
                  undefined,
                ]}
                cursor={{ fill: "var(--muted)", opacity: 0.3 }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {bars.map((b) => (
                  <Cell key={b.name} fill={b.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-between border-t border-border/50 pt-3 text-sm">
          <span className="text-muted-foreground">Net monthly</span>
          <span
            className={`text-base font-bold ${
              net >= 0 ? "text-success" : "text-destructive"
            }`}
          >
            {net >= 0 ? "+" : ""}
            {formatCurrency(net)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// ── C-right. "Analyse another property" CTA card ───────────────────────────

interface CreditsResponse {
  authenticated: boolean
  tier: string
  isUnlimited: boolean
  creditBalance: number
  freeUsed: number
  freeLimit: number
}

export function AnalyseAnotherCard({
  onNewAnalysis,
  onUpgrade,
}: {
  onNewAnalysis?: () => void
  onUpgrade?: () => void
}) {
  const [credits, setCredits] = useState<CreditsResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/user/credits")
      .then((r) => (r.ok ? (r.json() as Promise<CreditsResponse>) : null))
      .then((d) => {
        if (!cancelled && d) setCredits(d)
      })
      .catch(() => {
        /* silent — card still renders without the usage note */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const remaining = credits
    ? Math.max(0, credits.freeLimit - credits.freeUsed) + credits.creditBalance
    : null

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex flex-col gap-3 py-5">
        <p className="text-sm font-semibold text-foreground">
          Analyse another property
        </p>
        <p className="text-xs text-muted-foreground">
          {credits?.isUnlimited ? (
            <>
              <Sparkles className="mr-1 inline size-3 text-primary" />
              Pro — unlimited analyses
            </>
          ) : remaining !== null ? (
            `${remaining} analys${remaining === 1 ? "is" : "es"} remaining on your plan`
          ) : (
            "Run your next deal through the analyser"
          )}
        </p>
        <Button size="sm" className="w-full gap-1.5" onClick={onNewAnalysis}>
          New analysis
          <ArrowRight className="size-3.5" />
        </Button>
        {!credits?.isUnlimited &&
          (onUpgrade ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full border-primary/40 text-primary hover:bg-primary/10"
              onClick={onUpgrade}
            >
              Upgrade to Pro
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full border-primary/40 text-primary hover:bg-primary/10"
              asChild
            >
              <Link href="/account#credits">Upgrade to Pro</Link>
            </Button>
          ))}
      </CardContent>
    </Card>
  )
}
