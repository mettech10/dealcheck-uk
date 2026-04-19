"use client"

/**
 * BRRRR-specific results panel — rendered from analysis-results.tsx when
 * investmentType === "brr". Shows 8 tailored displays:
 *
 *   1. Headline BRRRR metrics (recycled %, money left, uplift ratio, score)
 *   2. Deal journey timeline (acquisition → refurb → bridging → refinance)
 *   3. Cost breakdown table (all 6 phases)
 *   4. Financing breakdown (bridging vs refinance mortgage)
 *   5. BRR vs standard BTL comparison
 *   6. 5-axis deal score bars
 *   7. Verdict card
 *   8. Equity waterfall / uplift summary
 */

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { PropertyFormData, CalculationResults } from "@/lib/types"
import {
  formatCurrency,
  formatPercent,
  calculateBRRRRDealScore,
} from "@/lib/calculations"
import {
  Hammer,
  Wallet,
  Building2,
  TrendingUp,
  Banknote,
  Repeat2,
  CheckCircle2,
  AlertTriangle,
  Target,
  Layers,
  RefreshCw,
  Download,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface BRRRRResultsProps {
  data: PropertyFormData
  results: CalculationResults
}

export function BRRRRResults({ data, results }: BRRRRResultsProps) {
  const arv = data.arv ?? 0
  const score = calculateBRRRRDealScore(results, arv)

  // Phase costs (safe defaults if missing)
  const acqCost = results.brrrrAcquisitionCost ?? 0
  const refurbBudget = results.brrrrRefurbBudget ?? 0
  const refurbContingency = results.brrrrRefurbContingency ?? 0
  const refurbHolding = results.brrrrRefurbHoldingCost ?? 0
  const refurbTotal = results.brrrrRefurbTotal ?? 0
  const bridgingInt = results.brrrrBridgingInterest ?? 0
  const bridgingFees = results.brrrrBridgingFees ?? 0
  const bridgingTotal = results.brrrrBridgingTotal ?? 0
  const refArrFee = results.brrrrRefinanceArrangementFee ?? 0
  const refFees = results.brrrrRefinanceFees ?? 0
  const refinancedMortgage = results.refinancedMortgageAmount ?? 0
  const totalInvested = results.brrrrTotalCashInvested ?? 0
  const capitalReturned = results.brrrrCapitalReturned ?? 0
  const moneyLeft = results.moneyLeftInDeal ?? 0
  const recycledPct = results.brrrrCapitalRecycledPct ?? 0
  const upliftRatio = results.brrrrRefurbUpliftRatio ?? 0
  const equity = results.equityGained ?? 0

  const verdictColor =
    score.total >= 70
      ? "bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400"
      : score.total >= 50
      ? "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400"
      : "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-400"

  // Browser print-to-PDF: toggle body class so @media print CSS hides
  // all non-BRRRR chrome, then call window.print(). Users save as PDF
  // via the browser's print dialog.
  const handlePrintReport = () => {
    if (typeof document === "undefined") return
    document.body.classList.add("print-brrrr")
    const cleanup = () => {
      document.body.classList.remove("print-brrrr")
      window.removeEventListener("afterprint", cleanup)
    }
    window.addEventListener("afterprint", cleanup)
    // Give the class a beat to apply before triggering print
    setTimeout(() => window.print(), 50)
  }

  return (
    <div className="space-y-6 print-brrrr-root">
      {/* ── Download report button (hidden in print) ──────────────── */}
      <div className="flex items-center justify-between gap-3 no-print">
        <div>
          <h2 className="text-lg font-semibold">BRRRR Deal Report</h2>
          <p className="text-xs text-muted-foreground">
            Print or save the below as PDF for lenders, brokers, or your JV partner.
          </p>
        </div>
        <Button
          onClick={handlePrintReport}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Download className="size-4" />
          Download BRRRR Report
        </Button>
      </div>

      {/* ── Print-only header (visible only in print) ─────────────── */}
      <div className="hidden print:block print-header">
        <h1 className="text-2xl font-bold">BRRRR Deal Analysis Report</h1>
        <p className="text-sm text-muted-foreground">
          {data.address || "Property"} — {data.postcode} · {new Date().toLocaleDateString("en-GB")}
        </p>
      </div>

      {/* ── 1. Headline BRRRR Metrics ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Repeat2 className="size-5 text-primary" />
            BRRRR Headline Metrics
          </CardTitle>
          <CardDescription>
            Buy → Refurb → Rent → Refinance — key numbers at a glance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <HeadlineTile
              label="Capital Recycled"
              value={`${recycledPct.toFixed(1)}%`}
              sub={formatCurrency(capitalReturned)}
              tone={recycledPct >= 80 ? "good" : recycledPct >= 50 ? "ok" : "bad"}
            />
            <HeadlineTile
              label="Money Left In Deal"
              value={formatCurrency(moneyLeft)}
              sub="Post-refinance"
              tone={moneyLeft <= 5000 ? "good" : moneyLeft <= 25000 ? "ok" : "bad"}
            />
            <HeadlineTile
              label="Refurb Uplift"
              value={`${upliftRatio.toFixed(2)}×`}
              sub="(ARV − purchase) ÷ refurb"
              tone={upliftRatio >= 2 ? "good" : upliftRatio >= 1 ? "ok" : "bad"}
            />
            <HeadlineTile
              label="BRRRR Score"
              value={`${score.total}/100`}
              sub={score.label}
              tone={score.total >= 70 ? "good" : score.total >= 50 ? "ok" : "bad"}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Deal Journey Timeline ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-5 text-primary" />
            Deal Journey
          </CardTitle>
          <CardDescription>Each phase of the BRRRR cycle with its cost</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4">
            <JourneyStep
              icon={<Wallet className="size-4" />}
              phase="1 — Acquisition"
              cost={acqCost}
              detail={`Purchase ${formatCurrency(data.purchasePrice)} + SDLT ${formatCurrency(results.sdltAmount)} + legal/survey`}
            />
            <JourneyStep
              icon={<Hammer className="size-4" />}
              phase="2 — Refurbishment"
              cost={refurbTotal}
              detail={`Budget ${formatCurrency(refurbBudget)} + ${formatCurrency(refurbContingency)} contingency + ${formatCurrency(refurbHolding)} holding`}
            />
            {data.purchaseType === "bridging-loan" && (
              <JourneyStep
                icon={<Banknote className="size-4" />}
                phase="3 — Bridging Finance"
                cost={bridgingTotal}
                detail={`Interest ${formatCurrency(bridgingInt)} + fees ${formatCurrency(bridgingFees)}`}
              />
            )}
            <JourneyStep
              icon={<RefreshCw className="size-4" />}
              phase={`${data.purchaseType === "bridging-loan" ? "4" : "3"} — Refinance`}
              cost={refFees}
              detail={`New BTL mortgage ${formatCurrency(refinancedMortgage)} @ ${(data.refinanceRate ?? data.interestRate).toFixed(2)}% over ${data.refinanceTermYears ?? 25}yr — arrangement & valuation fees only`}
            />
            <JourneyStep
              icon={<Target className="size-4" />}
              phase="Final — Capital Recycled"
              cost={capitalReturned}
              detail={`Pulled out ${formatCurrency(capitalReturned)} of ${formatCurrency(totalInvested)} invested — ${recycledPct.toFixed(1)}% recycled`}
              positive
            />
          </ol>
        </CardContent>
      </Card>

      {/* ── 3. Cost Breakdown Table ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Phase-by-Phase Cost Breakdown</CardTitle>
          <CardDescription>Every pound that enters and exits the deal</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <tbody>
                <SectionRow title="Phase 1 — Acquisition" />
                <Row label="Purchase price" value={data.purchasePrice} />
                <Row label="SDLT" value={results.sdltAmount} />
                <Row label="Legal fees" value={data.legalFees} />
                <Row label="Survey" value={data.surveyCosts} />
                <Row label="Phase 1 total" value={acqCost} bold />

                <SectionRow title="Phase 2 — Refurbishment" />
                <Row label="Refurb budget" value={refurbBudget} />
                <Row
                  label={`Contingency (${data.refurbContingencyPercent ?? 10}%)`}
                  value={refurbContingency}
                />
                <Row
                  label={`Holding costs (${data.refurbHoldingMonths ?? 0} mo)`}
                  value={refurbHolding}
                />
                <Row label="Phase 2 total" value={refurbTotal} bold />

                {data.purchaseType === "bridging-loan" && (
                  <>
                    <SectionRow title="Phase 3 — Bridging Finance" />
                    <Row label="Bridging interest" value={bridgingInt} />
                    <Row label="Arrangement + exit fees" value={bridgingFees} />
                    <Row label="Phase 3 total" value={bridgingTotal} bold />
                  </>
                )}

                <SectionRow title="Phase — Refinance Fees" />
                <Row
                  label={`Arrangement fee (${data.refinanceArrangementFeePercent ?? 1}%)`}
                  value={refArrFee}
                />
                <Row
                  label="Valuation fee"
                  value={data.refinanceValuationFee ?? 0}
                />
                <Row label="Refinance fees total" value={refFees} bold />

                <SectionRow title="Capital Summary" highlight />
                <Row label="Total cash invested" value={totalInvested} bold />
                <Row
                  label="Refinanced mortgage"
                  value={refinancedMortgage}
                  sub={`${data.refinanceLTV ?? 75}% LTV on ${formatCurrency(arv)} ARV`}
                />
                <Row label="Capital returned" value={capitalReturned} />
                <Row label="Money left in deal" value={moneyLeft} bold />
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Financing Breakdown ──────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        {data.purchaseType === "bridging-loan" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Banknote className="size-4 text-amber-500" />
                Bridging Loan
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <KV label="LTV" value={`${data.bridgingLTV ?? 70}%`} />
              <KV label="Monthly rate" value={`${data.bridgingMonthlyRate ?? 0}%`} />
              <KV label="Term" value={`${data.bridgingTermMonths ?? 0} months`} />
              <KV label="Total interest" value={formatCurrency(bridgingInt)} />
              <KV label="Arrangement + exit" value={formatCurrency(bridgingFees)} />
              <KV label="Total cost" value={formatCurrency(bridgingTotal)} bold />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="size-4 text-primary" />
              Refinance Mortgage
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <KV label="ARV" value={formatCurrency(arv)} />
            <KV label="LTV" value={`${data.refinanceLTV ?? 75}%`} />
            <KV label="New loan" value={formatCurrency(refinancedMortgage)} />
            <KV label="Rate" value={`${(data.refinanceRate ?? data.interestRate).toFixed(2)}%`} />
            <KV label="Term" value={`${data.refinanceTermYears ?? 25} years`} />
            <KV
              label="Monthly payment"
              value={formatCurrency(results.monthlyMortgagePayment)}
              bold
            />
          </CardContent>
        </Card>
      </div>

      {/* ── 5. BRR vs Standard BTL ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>BRR vs Standard BTL</CardTitle>
          <CardDescription>
            What this deal looks like when you refinance the uplift vs buying at market value
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <ComparisonTile
              title="Standard BTL (no refurb)"
              capital={results.totalPurchaseCost}
              monthlyCF={results.monthlyCashFlow - (refurbTotal > 0 ? 0 : 0)}
              note="Capital stays in the deal"
              highlight={false}
            />
            <ComparisonTile
              title="BRRRR (refinance out)"
              capital={moneyLeft}
              monthlyCF={results.monthlyCashFlow}
              note={`${recycledPct.toFixed(0)}% recycled — roll into next deal`}
              highlight
            />
          </div>
        </CardContent>
      </Card>

      {/* ── 6. 5-Axis Score Bars ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="size-5 text-primary" />
            Deal Score Breakdown
          </CardTitle>
          <CardDescription>How the {score.total}/100 splits across the five axes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ScoreBar
            label="Capital Recycling"
            score={score.breakdown.capitalRecycling.score}
            max={score.breakdown.capitalRecycling.max}
            note={score.breakdown.capitalRecycling.note}
          />
          <ScoreBar
            label="Cashflow"
            score={score.breakdown.cashflow.score}
            max={score.breakdown.cashflow.max}
            note={score.breakdown.cashflow.note}
          />
          <ScoreBar
            label="Refurb Uplift"
            score={score.breakdown.refurbUplift.score}
            max={score.breakdown.refurbUplift.max}
            note={score.breakdown.refurbUplift.note}
          />
          <ScoreBar
            label="Yield on ARV"
            score={score.breakdown.yieldOnARV.score}
            max={score.breakdown.yieldOnARV.max}
            note={score.breakdown.yieldOnARV.note}
          />
          <ScoreBar
            label="ROCE"
            score={score.breakdown.roce.score}
            max={score.breakdown.roce.max}
            note={score.breakdown.roce.note}
          />
        </CardContent>
      </Card>

      {/* ── 7. Verdict Card ─────────────────────────────────────────── */}
      <Card className={`border-2 ${score.total >= 70 ? "border-green-500/40" : score.total >= 50 ? "border-amber-500/40" : "border-red-500/40"}`}>
        <CardContent className="py-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              {score.total >= 70 ? (
                <CheckCircle2 className="size-10 text-green-500" />
              ) : score.total >= 50 ? (
                <AlertTriangle className="size-10 text-amber-500" />
              ) : (
                <AlertTriangle className="size-10 text-red-500" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h3 className="text-xl font-semibold">
                  {score.label} BRRRR Deal
                </h3>
                <Badge variant="outline" className={verdictColor}>
                  {score.total}/100
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {verdictCopy(score.total, recycledPct, moneyLeft, upliftRatio)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 8. Equity / Uplift Summary ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-5 text-primary" />
            Equity &amp; Uplift
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <HeadlineTile
              label="Purchase Price"
              value={formatCurrency(data.purchasePrice)}
              sub="Your entry"
              tone="neutral"
            />
            <HeadlineTile
              label="After Repair Value"
              value={formatCurrency(arv)}
              sub={data.arvBasis ? `Basis: ${data.arvBasis}` : undefined}
              tone="neutral"
            />
            <HeadlineTile
              label="Equity Gained"
              value={formatCurrency(equity)}
              sub="Forced appreciation"
              tone={equity > 0 ? "good" : "bad"}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────

function HeadlineTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone: "good" | "ok" | "bad" | "neutral"
}) {
  const toneClass =
    tone === "good"
      ? "text-green-600 dark:text-green-400"
      : tone === "bad"
      ? "text-red-600 dark:text-red-400"
      : tone === "ok"
      ? "text-amber-600 dark:text-amber-400"
      : "text-foreground"
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

function JourneyStep({
  icon,
  phase,
  cost,
  detail,
  positive = false,
}: {
  icon: React.ReactNode
  phase: string
  cost: number
  detail: string
  positive?: boolean
}) {
  return (
    <li className="flex gap-3">
      <div
        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${positive ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`}
      >
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-sm">{phase}</span>
          <span
            className={`text-sm font-semibold ${positive ? "text-green-600" : ""}`}
          >
            {positive ? "+" : ""}
            {formatCurrency(cost)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </li>
  )
}

function SectionRow({ title, highlight = false }: { title: string; highlight?: boolean }) {
  return (
    <tr className={highlight ? "bg-primary/10" : "bg-muted/40"}>
      <td
        colSpan={2}
        className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
      >
        {title}
      </td>
    </tr>
  )
}

function Row({
  label,
  value,
  bold = false,
  sub,
}: {
  label: string
  value: number
  bold?: boolean
  sub?: string
}) {
  return (
    <tr className="border-t">
      <td className="px-3 py-2">
        <div className={bold ? "font-medium" : ""}>{label}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${bold ? "font-semibold" : ""}`}>
        {formatCurrency(value)}
      </td>
    </tr>
  )
}

function KV({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  )
}

function ComparisonTile({
  title,
  capital,
  monthlyCF,
  note,
  highlight,
}: {
  title: string
  capital: number
  monthlyCF: number
  note: string
  highlight: boolean
}) {
  return (
    <div
      className={`rounded-md border p-4 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}
    >
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="space-y-1 text-sm">
        <KV label="Capital committed" value={formatCurrency(capital)} />
        <KV label="Monthly cashflow" value={formatCurrency(monthlyCF)} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{note}</p>
    </div>
  )
}

function ScoreBar({
  label,
  score,
  max,
  note,
}: {
  label: string
  score: number
  max: number
  note: string
}) {
  const pct = max > 0 ? (score / max) * 100 : 0
  const barColor =
    pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {score}/{max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className={`h-2 rounded-full ${barColor}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{note}</div>
    </div>
  )
}

function verdictCopy(
  total: number,
  recycled: number,
  moneyLeft: number,
  uplift: number
): string {
  if (total >= 85) {
    return `Exceptional BRRRR: ${recycled.toFixed(0)}% of capital recycled with only ${formatCurrency(moneyLeft)} left in the deal. A ${uplift.toFixed(2)}× refurb uplift plus strong cashflow means this is a repeatable, scaling-friendly deal.`
  }
  if (total >= 70) {
    return `Strong BRRRR numbers. ${formatCurrency(moneyLeft)} left in the deal and ${recycled.toFixed(0)}% recycled puts you in position to refinance and redeploy. Check refurb quotes and refinance LTV assumptions before committing.`
  }
  if (total >= 50) {
    return `Workable but not exceptional. ${formatCurrency(moneyLeft)} stays in the deal. Push refurb efficiency, re-quote the refinance at a realistic ARV, and trim void months to improve recycling.`
  }
  if (total >= 30) {
    return `Marginal. Either the refurb uplift is too thin, capital recycling is weak, or post-refinance cashflow is tight. Re-evaluate the purchase price or ARV before proceeding.`
  }
  return `This deal fails BRRRR fundamentals — refurb uplift, capital recycling, and cashflow are all below target. Consider switching strategy or renegotiating the purchase.`
}
