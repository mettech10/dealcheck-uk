"use client"

/**
 * Flip-specific results panel — rendered from analysis-results.tsx when
 * investmentType === "flip". Mirrors brrrr-results.tsx in structure but
 * shows Flip-tailored displays:
 *
 *   1. 8 headline tiles (pre-tax, post-tax, ROI, score, ARV, capital,
 *      tax, timeline)
 *   2. Deal journey timeline (acquisition → refurb → holding → finance
 *      → exit → profit → tax → take-home)
 *   3. Phase-by-phase cost breakdown table
 *   4. 70% rule check panel (simple + strict MAO vs purchase)
 *   5. Strategy comparison (Flip vs Keep-as-BTL)
 *   6. 5-axis deal-score bars
 *   7. Verdict card with tailored copy
 *   8. Sensitivity sliders — ARV / refurb / holding months, live re-calc
 *
 * The print scaffolding (.print-flip-root) uses the same CSS hooks as
 * BRRRR — see app/globals.css.
 */

import { useMemo, useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import type { PropertyFormData, CalculationResults } from "@/lib/types"
import {
  formatCurrency,
  calculateAll,
  calculateFlipDealScore,
} from "@/lib/calculations"
import {
  Hammer,
  Wallet,
  TrendingUp,
  Banknote,
  CheckCircle2,
  AlertTriangle,
  Target,
  Layers,
  Download,
  Home,
  Scale,
  SlidersHorizontal,
  Calendar,
  Receipt,
  Tag,
} from "lucide-react"

interface FlipResultsProps {
  data: PropertyFormData
  results: CalculationResults
}

export function FlipResults({ data, results }: FlipResultsProps) {
  const arv = data.arv ?? 0

  // ── Sensitivity slider state (centres on user inputs) ───────────
  const [arvOverride, setArvOverride] = useState(arv)
  const [refurbOverride, setRefurbOverride] = useState(
    data.refurbishmentBudget || 0,
  )
  const [holdingOverride, setHoldingOverride] = useState(
    data.flipHoldingMonths ?? 6,
  )

  // Recompute only when slider values differ from form values.
  const sensitivityDirty =
    arvOverride !== arv ||
    refurbOverride !== (data.refurbishmentBudget || 0) ||
    holdingOverride !== (data.flipHoldingMonths ?? 6)

  const sensitivityResults = useMemo<CalculationResults>(() => {
    if (!sensitivityDirty) return results
    return calculateAll({
      ...data,
      arv: arvOverride,
      refurbishmentBudget: refurbOverride,
      flipHoldingMonths: holdingOverride,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    arvOverride,
    refurbOverride,
    holdingOverride,
    sensitivityDirty,
  ])

  // Values for rendering — always use sensitivity results so sliders are live.
  const r = sensitivityResults
  const score = r.flipDealScore ?? 0
  const scoreLabel = r.flipDealScoreLabel ?? "Poor"
  const scoreBreakdown = useMemo(
    () =>
      calculateFlipDealScore({
        preTaxProfit: r.flipPreTaxProfit ?? 0,
        postTaxROI: r.flipPostTaxROI ?? 0,
        arv: arvOverride,
        purchasePrice: data.purchasePrice,
        passesSimple70: r.flipPassesSimple70 ?? false,
        passesStrict70: r.flipPassesStrict70 ?? false,
        refurbBudget: r.flipRefurbBudget ?? 0,
        holdingMonths: r.flipHoldingMonths ?? holdingOverride,
      }),
    [r, arvOverride, data.purchasePrice, holdingOverride],
  )

  // ── Headline numbers ────────────────────────────────────────────
  const preTax = r.flipPreTaxProfit ?? 0
  const postTax = r.flipPostTaxProfit ?? 0
  const postTaxROI = r.flipPostTaxROI ?? 0
  const capitalInvested = r.flipTotalCapitalInvested ?? 0
  const taxLiability = r.flipTaxLiability ?? 0
  const taxType = r.flipTaxType ?? "cgt"
  const projectMonths = r.flipTotalProjectMonths ?? 0

  const acqCost = r.flipAcquisitionCost ?? 0
  const refurbBudget = r.flipRefurbBudget ?? 0
  const refurbContingency = r.flipRefurbContingency ?? 0
  const refurbTotal = r.flipRefurbTotal ?? 0
  const holdingTotal = r.flipHoldingCostsTotal ?? 0
  const monthlyHolding = r.flipMonthlyHoldingCost ?? 0
  const financeTotal = r.flipFinanceTotal ?? 0
  const agentFee = r.flipAgentFee ?? 0
  const saleLegal = data.flipSaleLegalFees ?? 0
  const marketing = r.flipMarketingCosts ?? 0
  const exitTotal = r.flipExitCostsTotal ?? 0

  const simpleMAO = r.flipSimpleMAO ?? 0
  const strictMAO = r.flipStrictMAO ?? 0
  const passesSimple = r.flipPassesSimple70 ?? false
  const passesStrict = r.flipPassesStrict70 ?? false
  const percentOfARV = r.flipPercentOfARV ?? 0

  const verdictColor =
    score >= 70
      ? "bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400"
      : score >= 50
      ? "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400"
      : "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-400"

  // ── Print → browser save-as-PDF ─────────────────────────────────
  const handlePrintReport = () => {
    if (typeof document === "undefined") return
    document.body.classList.add("print-flip")
    const cleanup = () => {
      document.body.classList.remove("print-flip")
      window.removeEventListener("afterprint", cleanup)
    }
    window.addEventListener("afterprint", cleanup)
    setTimeout(() => window.print(), 50)
  }

  return (
    <div className="space-y-6 print-flip-root">
      {/* ── Download report button (hidden in print) ──────────────── */}
      <div className="flex items-center justify-between gap-3 no-print">
        <div>
          <h2 className="text-lg font-semibold">Flip Deal Report</h2>
          <p className="text-xs text-muted-foreground">
            Print or save the below as PDF — the full Flip Deal Pack.
          </p>
        </div>
        <Button
          onClick={handlePrintReport}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Download className="size-4" />
          Download Flip Report
        </Button>
      </div>

      {/* ── Print-only header (visible only in print) ─────────────── */}
      <div className="hidden print:block print-header">
        <h1 className="text-2xl font-bold">Flip Deal Analysis Report</h1>
        <p className="text-sm text-muted-foreground">
          {data.address || "Property"} — {data.postcode} ·{" "}
          {new Date().toLocaleDateString("en-GB")}
        </p>
      </div>

      {/* ── 1. Headline Metrics (8 tiles) ──────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="size-5 text-primary" />
            Flip Headline Metrics
          </CardTitle>
          <CardDescription>
            Buy → Refurb → Sell — the numbers that decide the deal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <HeadlineTile
              label="Pre-Tax Profit"
              value={formatCurrency(preTax)}
              sub="Before CGT / CT"
              tone={preTax >= 30000 ? "good" : preTax >= 10000 ? "ok" : "bad"}
            />
            <HeadlineTile
              label="Post-Tax Profit"
              value={formatCurrency(postTax)}
              sub="Take-home"
              tone={postTax >= 25000 ? "good" : postTax >= 8000 ? "ok" : "bad"}
            />
            <HeadlineTile
              label="Post-Tax ROI"
              value={`${postTaxROI.toFixed(1)}%`}
              sub="On capital invested"
              tone={postTaxROI >= 20 ? "good" : postTaxROI >= 10 ? "ok" : "bad"}
            />
            <HeadlineTile
              label="Flip Score"
              value={`${score}/100`}
              sub={scoreLabel}
              tone={score >= 70 ? "good" : score >= 50 ? "ok" : "bad"}
            />
            <HeadlineTile
              label="After Repair Value"
              value={formatCurrency(arvOverride)}
              sub={
                sensitivityDirty && arvOverride !== arv
                  ? `adj. from ${formatCurrency(arv)}`
                  : data.arvBasis
                    ? `Basis: ${data.arvBasis}`
                    : "Sale price"
              }
              tone="neutral"
            />
            <HeadlineTile
              label="Capital Invested"
              value={formatCurrency(capitalInvested)}
              sub="Cash out of pocket"
              tone="neutral"
            />
            <HeadlineTile
              label={taxType === "ct" ? "Corporation Tax" : "Capital Gains Tax"}
              value={formatCurrency(taxLiability)}
              sub={`${(r.flipTaxRateUsed ?? 0).toFixed(0)}% rate`}
              tone="neutral"
            />
            <HeadlineTile
              label="Project Timeline"
              value={`${projectMonths} mo`}
              sub="Purchase → sale complete"
              tone={projectMonths <= 6 ? "good" : projectMonths <= 12 ? "ok" : "bad"}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Deal Journey ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-5 text-primary" />
            Deal Journey
          </CardTitle>
          <CardDescription>
            Every phase of the flip with its net cash effect
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4">
            <JourneyStep
              icon={<Wallet className="size-4" />}
              phase="1 — Acquisition"
              cost={acqCost}
              detail={`Purchase ${formatCurrency(data.purchasePrice)} + SDLT ${formatCurrency(r.sdltAmount)} + legal/survey`}
            />
            <JourneyStep
              icon={<Hammer className="size-4" />}
              phase="2 — Refurbishment"
              cost={refurbTotal}
              detail={`Budget ${formatCurrency(refurbBudget)} + ${formatCurrency(refurbContingency)} contingency (${data.refurbContingencyPercent ?? 10}%)`}
            />
            <JourneyStep
              icon={<Home className="size-4" />}
              phase="3 — Holding"
              cost={holdingTotal}
              detail={`${formatCurrency(monthlyHolding)}/mo × ${r.flipHoldingMonths ?? 0} months (council tax, insurance, utilities${(data.flipServiceChargeMonthly ?? 0) > 0 ? ", service charge" : ""})`}
            />
            {financeTotal > 0 && (
              <JourneyStep
                icon={<Banknote className="size-4" />}
                phase="4 — Finance"
                cost={financeTotal}
                detail={
                  data.purchaseType === "bridging-loan"
                    ? `Bridging interest + arrangement + exit fees over ${r.flipHoldingMonths ?? 0} months`
                    : `Mortgage payments × ${r.flipHoldingMonths ?? 0} months held`
                }
              />
            )}
            <JourneyStep
              icon={<Tag className="size-4" />}
              phase={`${financeTotal > 0 ? "5" : "4"} — Exit`}
              cost={exitTotal}
              detail={`Agent ${formatCurrency(agentFee)} (${(data.flipAgentFeePercent ?? 1.5).toFixed(1)}%) + sale legal ${formatCurrency(saleLegal)} + marketing ${formatCurrency(marketing)}`}
            />
            <JourneyStep
              icon={<TrendingUp className="size-4" />}
              phase="Pre-tax profit"
              cost={preTax}
              detail={`${formatCurrency(arvOverride)} sale − all costs`}
              positive={preTax > 0}
            />
            <JourneyStep
              icon={<Receipt className="size-4" />}
              phase={`Tax (${taxType === "ct" ? "Corporation Tax" : "CGT"})`}
              cost={taxLiability}
              detail={
                taxType === "ct"
                  ? `${r.flipTaxRateUsed ?? 25}% CT on ${formatCurrency(r.flipTaxableGain ?? 0)} profit`
                  : `${r.flipTaxRateUsed ?? 24}% CGT on ${formatCurrency(r.flipTaxableGain ?? 0)} taxable gain (after £${data.flipCGTAllowanceRemaining ?? 3000} allowance)`
              }
            />
            <JourneyStep
              icon={<Target className="size-4" />}
              phase="Take-home profit"
              cost={postTax}
              detail={`${formatCurrency(postTax)} post-tax on ${formatCurrency(capitalInvested)} capital — ${postTaxROI.toFixed(1)}% ROI`}
              positive={postTax > 0}
            />
          </ol>
        </CardContent>
      </Card>

      {/* ── 3. Cost Breakdown Table ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Phase-by-Phase Cost Breakdown</CardTitle>
          <CardDescription>
            Every pound from purchase to sale
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <tbody>
                <SectionRow title="Phase 1 — Acquisition" />
                <Row label="Purchase price" value={data.purchasePrice} />
                <Row label="SDLT" value={r.sdltAmount} />
                <Row label="Legal fees" value={data.legalFees} />
                <Row label="Survey" value={data.surveyCosts} />
                <Row label="Phase 1 total" value={acqCost} bold />

                <SectionRow title="Phase 2 — Refurbishment" />
                <Row label="Refurb budget" value={refurbBudget} />
                <Row
                  label={`Contingency (${data.refurbContingencyPercent ?? 10}%)`}
                  value={refurbContingency}
                />
                <Row label="Phase 2 total" value={refurbTotal} bold />

                <SectionRow title="Phase 3 — Holding" />
                <Row
                  label={`Council tax / insurance / utilities${(data.flipServiceChargeMonthly ?? 0) > 0 ? " / service" : ""}`}
                  value={monthlyHolding}
                  sub={`per month × ${r.flipHoldingMonths ?? 0} months`}
                />
                <Row label="Phase 3 total" value={holdingTotal} bold />

                {financeTotal > 0 && (
                  <>
                    <SectionRow title="Phase 4 — Finance" />
                    {data.purchaseType === "bridging-loan" &&
                      r.bridgingLoanDetails && (
                        <>
                          <Row
                            label="Bridging interest"
                            value={r.bridgingLoanDetails.totalInterest}
                          />
                          <Row
                            label="Arrangement + exit fees"
                            value={
                              r.bridgingLoanDetails.arrangementFee +
                              r.bridgingLoanDetails.exitFee
                            }
                          />
                        </>
                      )}
                    {data.purchaseType === "mortgage" && (
                      <Row
                        label={`Mortgage payments × ${r.flipHoldingMonths ?? 0} mo`}
                        value={financeTotal}
                      />
                    )}
                    <Row label="Phase 4 total" value={financeTotal} bold />
                  </>
                )}

                <SectionRow title="Phase — Exit" />
                <Row
                  label={`Agent fee (${(data.flipAgentFeePercent ?? 1.5).toFixed(1)}% of ARV)`}
                  value={agentFee}
                />
                <Row label="Sale legal" value={saleLegal} />
                <Row label="Marketing" value={marketing} />
                <Row label="Exit total" value={exitTotal} bold />

                <SectionRow title="Result" highlight />
                <Row label="Sale proceeds (ARV)" value={arvOverride} bold />
                <Row
                  label="Total costs"
                  value={arvOverride - preTax}
                  sub="Acquisition + refurb + holding + finance + exit"
                />
                <Row label="Pre-tax profit" value={preTax} bold />
                <Row
                  label={`Tax (${taxType === "ct" ? "Corporation Tax" : "CGT"})`}
                  value={taxLiability}
                />
                <Row label="Post-tax profit" value={postTax} bold />
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. 70% Rule Check ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="size-5 text-primary" />
            70% Rule Check
          </CardTitle>
          <CardDescription>
            Classic flipper test — keep the purchase price low enough that
            the spread absorbs refurb, costs, and still delivers margin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border bg-card p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Purchase vs ARV
              </div>
              <div
                className={`mt-1 text-xl font-semibold ${percentOfARV <= 70 ? "text-green-600" : "text-red-600"}`}
              >
                {percentOfARV.toFixed(1)}%
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {formatCurrency(data.purchasePrice)} of {formatCurrency(arvOverride)}
              </div>
            </div>
            <div className="rounded-md border bg-card p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Simple MAO
              </div>
              <div
                className={`mt-1 text-xl font-semibold ${passesSimple ? "text-green-600" : "text-red-600"}`}
              >
                {formatCurrency(simpleMAO)}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                ARV × 70% − refurb
              </div>
            </div>
            <div className="rounded-md border bg-card p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Strict MAO
              </div>
              <div
                className={`mt-1 text-xl font-semibold ${passesStrict ? "text-green-600" : "text-red-600"}`}
              >
                {formatCurrency(strictMAO)}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                ARV × 70% − all non-purchase costs
              </div>
            </div>
          </div>

          <div
            className={`rounded-md border p-3 text-sm ${
              passesStrict
                ? "border-green-500/30 bg-green-500/5"
                : passesSimple
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-red-500/30 bg-red-500/5"
            }`}
          >
            {passesStrict ? (
              <span className="text-green-700 dark:text-green-400">
                <strong>Passes strict 70% rule.</strong> Purchase is{" "}
                {formatCurrency(strictMAO - data.purchasePrice)} below the
                strict MAO — plenty of margin for cost overruns.
              </span>
            ) : passesSimple ? (
              <span className="text-amber-700 dark:text-amber-400">
                <strong>Passes simple 70% rule but not strict.</strong> You'd
                need {formatCurrency(data.purchasePrice - strictMAO)} of
                either price cut or cost savings to have a comfortable
                margin.
              </span>
            ) : (
              <span className="text-red-700 dark:text-red-400">
                <strong>Fails the 70% rule.</strong> You're paying{" "}
                {formatCurrency(data.purchasePrice - simpleMAO)} above simple
                MAO — costs will likely wipe out the profit. Either push the
                ARV (verify comps), cut refurb, or walk.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── 5. Strategy comparison — Flip vs Keep-as-BTL ────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Flip vs Keep as BTL</CardTitle>
          <CardDescription>
            What this project looks like if you sold vs retained it at the
            end of the refurb
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <ComparisonTile
              title="Flip (sell at ARV)"
              lines={[
                { k: "Sale price", v: formatCurrency(arvOverride) },
                { k: "Pre-tax profit", v: formatCurrency(preTax) },
                { k: "Tax", v: formatCurrency(taxLiability) },
                { k: "Take-home", v: formatCurrency(postTax), bold: true },
                { k: "ROI on capital", v: `${postTaxROI.toFixed(1)}%` },
              ]}
              note="One-off gain — capital + profit back for next deal."
              highlight
            />
            <ComparisonTile
              title="Keep as BTL (refinance + rent)"
              lines={[
                {
                  k: "Refinance @ 75% LTV",
                  v: formatCurrency(Math.round(arvOverride * 0.75)),
                },
                {
                  k: "Equity captured",
                  v: formatCurrency(
                    Math.max(
                      0,
                      Math.round(arvOverride * 0.75) -
                        (data.purchasePrice - r.depositAmount),
                    ),
                  ),
                },
                {
                  k: "Monthly rent needed to break even",
                  v: formatCurrency(
                    Math.round(
                      (arvOverride * 0.75 * ((data.refinanceRate ?? 5.5) / 100)) /
                        12 +
                        ((arvOverride * 0.75) / (data.refinanceTermYears ?? 25 * 12)),
                    ),
                  ),
                },
                { k: "Capital left in", v: formatCurrency(capitalInvested) },
              ]}
              note="Ongoing asset — compare against local BTL yield before deciding."
              highlight={false}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── 6. 5-Axis Deal Score Bars ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="size-5 text-primary" />
            Deal Score Breakdown
          </CardTitle>
          <CardDescription>
            How the {score}/100 splits across the five Flip axes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ScoreBar
            label="Profit Margin"
            score={scoreBreakdown.breakdown.profitMargin.score}
            max={scoreBreakdown.breakdown.profitMargin.max}
            note={scoreBreakdown.breakdown.profitMargin.note}
          />
          <ScoreBar
            label="Post-Tax ROI"
            score={scoreBreakdown.breakdown.postTaxROI.score}
            max={scoreBreakdown.breakdown.postTaxROI.max}
            note={scoreBreakdown.breakdown.postTaxROI.note}
          />
          <ScoreBar
            label="70% Rule"
            score={scoreBreakdown.breakdown.seventyRule.score}
            max={scoreBreakdown.breakdown.seventyRule.max}
            note={scoreBreakdown.breakdown.seventyRule.note}
          />
          <ScoreBar
            label="Refurb Uplift"
            score={scoreBreakdown.breakdown.refurbUplift.score}
            max={scoreBreakdown.breakdown.refurbUplift.max}
            note={scoreBreakdown.breakdown.refurbUplift.note}
          />
          <ScoreBar
            label="Timeline Risk"
            score={scoreBreakdown.breakdown.timelineRisk.score}
            max={scoreBreakdown.breakdown.timelineRisk.max}
            note={scoreBreakdown.breakdown.timelineRisk.note}
          />
        </CardContent>
      </Card>

      {/* ── 7. Verdict Card ─────────────────────────────────────────── */}
      <Card
        className={`border-2 ${score >= 70 ? "border-green-500/40" : score >= 50 ? "border-amber-500/40" : "border-red-500/40"}`}
      >
        <CardContent className="py-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              {score >= 70 ? (
                <CheckCircle2 className="size-10 text-green-500" />
              ) : score >= 50 ? (
                <AlertTriangle className="size-10 text-amber-500" />
              ) : (
                <AlertTriangle className="size-10 text-red-500" />
              )}
            </div>
            <div className="flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-semibold">
                  {scoreLabel} Flip Deal
                </h3>
                <Badge variant="outline" className={verdictColor}>
                  {score}/100
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {verdictCopy(score, postTax, postTaxROI, passesStrict, passesSimple, projectMonths)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 8. Sensitivity Sliders ──────────────────────────────────── */}
      <Card className="no-print">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="size-5 text-primary" />
            Sensitivity Analysis
          </CardTitle>
          <CardDescription>
            Drag to test different ARV, refurb, and timeline assumptions —
            every card above recomputes live.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SliderRow
            label="ARV"
            value={arvOverride}
            min={Math.max(0, Math.round(arv * 0.8))}
            max={Math.round(arv * 1.2)}
            step={1000}
            format={(v) => formatCurrency(v)}
            onChange={setArvOverride}
            delta={arvOverride - arv}
            deltaLabel={arvOverride !== arv ? `${((arvOverride / arv - 1) * 100).toFixed(1)}% vs entered` : "at entered ARV"}
          />
          <SliderRow
            label="Refurb budget"
            value={refurbOverride}
            min={Math.max(0, Math.round((data.refurbishmentBudget || 0) * 0.6))}
            max={Math.round((data.refurbishmentBudget || 0) * 1.5)}
            step={500}
            format={(v) => formatCurrency(v)}
            onChange={setRefurbOverride}
            delta={refurbOverride - (data.refurbishmentBudget || 0)}
            deltaLabel={
              refurbOverride !== (data.refurbishmentBudget || 0)
                ? `${(((refurbOverride / (data.refurbishmentBudget || 1)) - 1) * 100).toFixed(1)}% vs entered`
                : "at entered refurb"
            }
            icon={<Hammer className="size-4 text-muted-foreground" />}
          />
          <SliderRow
            label="Holding months"
            value={holdingOverride}
            min={Math.max(1, (data.flipHoldingMonths ?? 6) - 6)}
            max={Math.min(36, (data.flipHoldingMonths ?? 6) + 12)}
            step={1}
            format={(v) => `${v} mo`}
            onChange={setHoldingOverride}
            delta={holdingOverride - (data.flipHoldingMonths ?? 6)}
            deltaLabel={
              holdingOverride !== (data.flipHoldingMonths ?? 6)
                ? `${holdingOverride - (data.flipHoldingMonths ?? 6) > 0 ? "+" : ""}${holdingOverride - (data.flipHoldingMonths ?? 6)} mo vs entered`
                : "at entered duration"
            }
            icon={<Calendar className="size-4 text-muted-foreground" />}
          />

          {sensitivityDirty && (
            <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <span className="text-muted-foreground">
                Live recalc — sliders feeding every card above
              </span>
              <button
                type="button"
                onClick={() => {
                  setArvOverride(arv)
                  setRefurbOverride(data.refurbishmentBudget || 0)
                  setHoldingOverride(data.flipHoldingMonths ?? 6)
                }}
                className="text-xs font-medium text-primary underline hover:text-primary/80"
              >
                Reset to entered values
              </button>
            </div>
          )}
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
        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${
          positive
            ? "bg-green-500/15 text-green-600"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">{phase}</span>
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

function SectionRow({
  title,
  highlight = false,
}: {
  title: string
  highlight?: boolean
}) {
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
      <td
        className={`px-3 py-2 text-right tabular-nums ${bold ? "font-semibold" : ""}`}
      >
        {formatCurrency(value)}
      </td>
    </tr>
  )
}

function ComparisonTile({
  title,
  lines,
  note,
  highlight,
}: {
  title: string
  lines: { k: string; v: string; bold?: boolean }[]
  note: string
  highlight: boolean
}) {
  return (
    <div
      className={`rounded-md border p-4 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}
    >
      <div className="mb-2 text-sm font-medium">{title}</div>
      <div className="space-y-1 text-sm">
        {lines.map((l) => (
          <div key={l.k} className="flex items-baseline justify-between">
            <span className="text-muted-foreground">{l.k}</span>
            <span className={l.bold ? "font-semibold" : ""}>{l.v}</span>
          </div>
        ))}
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

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  delta,
  deltaLabel,
  icon,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  delta: number
  deltaLabel: string
  icon?: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tabular-nums">
            {format(value)}
          </span>
          <span
            className={`text-xs ${delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : "text-muted-foreground"}`}
          >
            {deltaLabel}
          </span>
        </div>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  )
}

function verdictCopy(
  total: number,
  postTax: number,
  roi: number,
  passesStrict: boolean,
  passesSimple: boolean,
  months: number,
): string {
  if (total >= 85) {
    return `Exceptional flip: ${formatCurrency(postTax)} take-home at ${roi.toFixed(1)}% ROI${passesStrict ? " with the strict 70% rule passing" : ""}. A ${months}-month project of this quality is rare — sanity-check the ARV with fresh comps, then move.`
  }
  if (total >= 70) {
    return `Strong numbers: ${formatCurrency(postTax)} post-tax, ${roi.toFixed(1)}% ROI${passesStrict ? " and passes strict 70%" : passesSimple ? " and passes simple 70%" : ""}. Firm refurb quotes + a realistic sale timeline are the next due-diligence steps.`
  }
  if (total >= 50) {
    return `Workable but thin. ${formatCurrency(postTax)} take-home on a ${months}-month project${!passesStrict && passesSimple ? " that only clears the simple 70% rule" : ""}. Every £5k of refurb creep or one extra month of finance eats the margin — push for price cuts before committing.`
  }
  if (total >= 30) {
    return `Marginal. Either ARV is optimistic, refurb is light, or the 70% rule fails. Re-verify comps, get multiple refurb quotes, and model a worst-case timeline before this becomes a loss.`
  }
  return `Fails the fundamentals — low margin, weak ROI, ${!passesSimple ? "breaks the 70% rule, " : ""}and the take-home doesn't justify the risk. Walk, renegotiate hard, or pivot to BRRRR / BTL.`
}
