"use client"

/**
 * /tools/compare — Deal Comparison Tool.
 *
 * Login-gated. Requires at least 2 saved analyses to be useful.
 *
 * Flow:
 *   1. Fetch user's saved deals via /api/analyses
 *   2. User picks 2 deals (or 3 if Pro)
 *   3. We refetch full data for each via /api/analyses/[id]
 *   4. Render side-by-side comparison table
 *   5. Compute per-metric winner (teal/red highlighting) +
 *      weighted overall recommendation
 *   6. Pro: PDF export
 *
 * Tier rules (Section 7):
 *   - Free: 2-deal cap. Third slot is "+ Add Third Deal · Pro feature"
 *   - Pro:  3 deals + PDF export
 *
 * The scoring engine (lib/dealScoring.ts) re-runs client-side from
 * each deal's stored form_data / results / backend_data so verdicts
 * stay in sync with any rubric changes since the deal was saved.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Scale,
  Trophy,
  AlertTriangle,
  Sparkles,
  Lock,
  Download,
} from "lucide-react"
import { ToolsTopBar } from "@/components/tools/tools-top-bar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { formatCurrency } from "@/lib/calculations"
import { scoreDeal, type ScoreResult } from "@/lib/dealScoring"
import { buildScoringInput } from "@/lib/buildScoringInput"
import type {
  PropertyFormData,
  CalculationResults,
  BackendResults,
} from "@/lib/types"

interface SavedDealSummary {
  id: string
  created_at: string
  address: string
  postcode: string | null
  investment_type: string
  purchase_price: number | null
  deal_score: number | null
  monthly_cashflow: number | null
  gross_yield: number | null
}

interface SavedDealFull {
  id: string
  address: string
  form_data: PropertyFormData
  results: CalculationResults
  backend_data: BackendResults | null
  scoreResult: ScoreResult
}

export default function ComparePage() {
  const [authChecked, setAuthChecked] = useState(false)
  const [isLoggedIn, setLoggedIn] = useState(false)
  const [isPro, setIsPro] = useState(false)
  const [saved, setSaved] = useState<SavedDealSummary[]>([])
  const [selected, setSelected] = useState<(string | null)[]>([null, null, null])
  const [loadedDeals, setLoadedDeals] = useState<SavedDealFull[]>([])
  const [comparing, setComparing] = useState(false)

  // ── Auth probe via API (server-side cookie auth) ────────────
  // Browser SDK can't see httpOnly session cookies. Probe /api/analyses
  // directly; 401 → unauthed, success → user is signed in and we have
  // their saved deals in the response. Then fetch tier in parallel.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/analyses")
        if (r.status === 401) {
          setAuthChecked(true)
          return
        }
        const j = await r.json()
        setLoggedIn(true)
        setSaved(j.analyses || [])
        // Tier in parallel (non-blocking — defaults to Free if /api/usage
        // fails or the user is on a free plan).
        try {
          const tierRes = await fetch("/api/usage")
          if (tierRes.ok) {
            const tj = await tierRes.json()
            setIsPro(tj.tier === "pro" || tj.tier === "enterprise")
          }
        } catch { /* ignore */ }
      } catch (e) {
        console.error("[compare] auth probe failed:", e)
      } finally {
        setAuthChecked(true)
      }
    })()
  }, [])

  const maxSlots = isPro ? 3 : 2

  const runCompare = async () => {
    const ids = selected.filter((s, i) => s && i < maxSlots) as string[]
    if (ids.length < 2) {
      toast.error("Select at least 2 deals")
      return
    }
    setComparing(true)
    try {
      const full: SavedDealFull[] = []
      for (const id of ids) {
        const r = await fetch(`/api/analyses/${id}`)
        const j = await r.json()
        if (!r.ok) {
          toast.error(`Failed to load deal ${id.slice(0, 6)}`)
          continue
        }
        const scoreResult = scoreDeal(
          buildScoringInput(j.form_data, j.results, j.backend_data ?? undefined),
        )
        full.push({
          id: j.id,
          address: j.address,
          form_data: j.form_data,
          results: j.results,
          backend_data: j.backend_data,
          scoreResult,
        })
      }
      setLoadedDeals(full)
    } finally {
      setComparing(false)
    }
  }

  // ── Unauthed / not-enough-deals states ─────────────────────
  if (!authChecked) {
    return <div className="p-12 text-center text-muted-foreground">Loading…</div>
  }
  if (!isLoggedIn) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
        <ToolsTopBar />
        <div className="flex flex-col gap-6 pt-6 text-center">
          <Scale className="mx-auto size-12 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Deal Comparison</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to compare your saved property analyses side-by-side and see
            which deal wins on yield, cashflow, capital required, and deal score.
          </p>
          <div className="flex justify-center gap-3">
            <Button asChild>
              <Link href="/login?redirect=/tools/compare">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }
  if (saved.length < 2) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
        <ToolsTopBar />
        <div className="flex flex-col gap-6 pt-6 text-center">
          <Scale className="mx-auto size-12 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Deal Comparison</h1>
          <p className="text-sm text-muted-foreground">
            You need at least 2 saved analyses to compare deals. Run an analysis
            and save it, then come back here.
          </p>
          <Button asChild>
            <Link href="/analyse">Analyse a Deal</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10">
      <ToolsTopBar />
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Deal Comparison
        </h1>
        <p className="text-sm text-muted-foreground">
          Compare {maxSlots} deals side-by-side · scoring engine re-runs on
          current rubrics
        </p>
      </div>

      {/* Selectors */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Select up to {maxSlots} deals to compare
          </CardTitle>
          {!isPro && (
            <CardDescription className="text-xs">
              <Link href="/account" className="text-primary hover:underline">
                Upgrade to Pro
              </Link>{" "}
              to compare 3 deals and export PDF reports.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => {
              const isThird = i === 2
              const locked = isThird && !isPro
              return (
                <div key={i}>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Deal {i + 1}
                  </label>
                  {locked ? (
                    <div className="mt-1 flex h-10 items-center justify-between rounded-md border border-dashed border-border/40 px-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Lock className="size-3.5" />
                        Pro feature
                      </span>
                      <Link href="/account" className="text-primary hover:underline">
                        Upgrade
                      </Link>
                    </div>
                  ) : (
                    <select
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={selected[i] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null
                        setSelected((s) => s.map((x, idx) => (idx === i ? v : x)))
                      }}
                    >
                      <option value="">— Select deal —</option>
                      {saved.map((d) => (
                        <option key={d.id} value={d.id} disabled={selected.includes(d.id)}>
                          {d.address.slice(0, 30)} · {d.investment_type.toUpperCase()} · £{Math.round(Number(d.purchase_price || 0) / 1000)}k
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={runCompare} disabled={comparing}>
              {comparing ? "Loading…" : "Compare These Deals →"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Comparison results */}
      {loadedDeals.length >= 2 && (
        <ComparisonResults deals={loadedDeals} isPro={isPro} />
      )}
    </div>
  )
}

// ── ComparisonResults ──────────────────────────────────────────────────

function ComparisonResults({ deals, isPro }: { deals: SavedDealFull[]; isPro: boolean }) {
  // Winner-per-metric calculation
  const winners = useMemo(() => computeWinners(deals), [deals])
  // Overall recommendation
  const recommendation = useMemo(() => computeRecommendation(deals), [deals])

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Side-by-Side Comparison</CardTitle>
          <CardDescription>
            Best per metric highlighted in teal, weakest in red
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="py-2 text-left font-semibold text-muted-foreground">Metric</th>
                {deals.map((d, i) => (
                  <th key={d.id} className="py-2 text-left font-semibold text-foreground">
                    Deal {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <RowGroup title="Property" />
              <Row label="Address" deals={deals} get={(d) => d.address.slice(0, 28)} />
              <Row label="Strategy" deals={deals} get={(d) => d.form_data.investmentType.toUpperCase()} />
              <Row label="Purchase Price" deals={deals} get={(d) => formatCurrency(d.form_data.purchasePrice)} />
              <Row
                label="Deal Score"
                deals={deals}
                get={(d) => `${d.scoreResult.total}/100 (${d.scoreResult.label})`}
                winnerIdx={winners.dealScore}
              />

              <RowGroup title="Financial Returns" />
              <Row
                label="Gross Yield"
                deals={deals}
                get={(d) => `${d.results.grossYield.toFixed(2)}%`}
                winnerIdx={winners.grossYield}
              />
              <Row label="Net Yield" deals={deals} get={(d) => `${d.results.netYield.toFixed(2)}%`} winnerIdx={winners.netYield} />
              <Row
                label="Monthly Cashflow"
                deals={deals}
                get={(d) => (d.results.monthlyCashFlow >= 0 ? "+" : "") + formatCurrency(d.results.monthlyCashFlow)}
                winnerIdx={winners.monthlyCashflow}
              />
              <Row
                label="Annual Cashflow"
                deals={deals}
                get={(d) => (d.results.annualCashFlow >= 0 ? "+" : "") + formatCurrency(d.results.annualCashFlow)}
                winnerIdx={winners.annualCashflow}
              />
              <Row
                label="Cash-on-Cash ROI"
                deals={deals}
                get={(d) => `${d.results.cashOnCashReturn.toFixed(2)}%`}
                winnerIdx={winners.cashOnCash}
              />

              <RowGroup title="Capital Required" />
              <Row
                label="Total Capital"
                deals={deals}
                get={(d) => formatCurrency(d.results.totalCapitalRequired)}
                winnerIdx={winners.totalCapital}
                lowerIsBetter
              />
              <Row label="Deposit" deals={deals} get={(d) => formatCurrency(d.results.depositAmount)} />
              <Row label="SDLT" deals={deals} get={(d) => formatCurrency(d.results.sdltAmount)} />

              <RowGroup title="Risk Profile" />
              <Row
                label="Article 4"
                deals={deals}
                get={(d) => {
                  const a4 = d.backend_data?.article_4
                  if (!a4) return "Unknown"
                  return a4.is_article_4 ? "⚠ Active" : "✓ None"
                }}
              />
              <Row label="Tenure" deals={deals} get={(d) => (d.form_data.tenureType ?? "—").toString()} />
              <Row label="Condition" deals={deals} get={(d) => d.form_data.condition} />
              <Row label="Critical Flags" deals={deals} get={(d) => d.scoreResult.criticalFlags.length === 0 ? "None" : `${d.scoreResult.criticalFlags.length} flag${d.scoreResult.criticalFlags.length === 1 ? "" : "s"}`} />
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Verdict card */}
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="size-5 text-primary" />
            Comparison Verdict
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <VerdictLine label="🏆 Best deal score" value={`Deal ${winners.dealScore + 1} — ${deals[winners.dealScore].scoreResult.total}/100`} />
          <VerdictLine label="💷 Best monthly cashflow" value={`Deal ${winners.monthlyCashflow + 1} — ${(deals[winners.monthlyCashflow].results.monthlyCashFlow >= 0 ? "+" : "") + formatCurrency(deals[winners.monthlyCashflow].results.monthlyCashFlow)}/mo`} />
          <VerdictLine label="📊 Best gross yield" value={`Deal ${winners.grossYield + 1} — ${deals[winners.grossYield].results.grossYield.toFixed(2)}%`} />
          <VerdictLine label="💰 Lowest capital required" value={`Deal ${winners.totalCapital + 1} — ${formatCurrency(deals[winners.totalCapital].results.totalCapitalRequired)}`} />

          {/* Critical flag warnings across deals */}
          {deals.some((d) => d.scoreResult.criticalFlags.length > 0) && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div>
                {deals.map((d, i) =>
                  d.scoreResult.criticalFlags.length > 0 ? (
                    <div key={d.id}>
                      <strong>Deal {i + 1}:</strong>{" "}
                      {d.scoreResult.criticalFlags.map((f) => f.message.replace("⚠ ", "")).join(" · ")}
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          )}

          <div className="mt-2 rounded-md border border-border/40 bg-background/60 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Overall Recommendation
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              Deal {recommendation.winnerIdx + 1} —{" "}
              {deals[recommendation.winnerIdx].address.slice(0, 40)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {recommendation.rationale}
            </p>
          </div>

          {isPro ? (
            <Button variant="outline" className="w-fit gap-2" onClick={() => window.print()}>
              <Download className="size-4" />
              Save Comparison as PDF
            </Button>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-border/40 bg-background/60 p-3 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-amber-500" />
              <span>
                <Link href="/account" className="text-primary hover:underline font-semibold">
                  Upgrade to Pro
                </Link>{" "}
                to export PDF comparison reports.
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Row helpers ───────────────────────────────────────────────────────

function RowGroup({ title }: { title: string }) {
  return (
    <tr>
      <td colSpan={4} className="border-b border-border/30 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-primary">
        {title}
      </td>
    </tr>
  )
}

function Row<T>({
  label,
  deals,
  get,
  winnerIdx,
  lowerIsBetter,
}: {
  label: string
  deals: SavedDealFull[]
  get: (d: SavedDealFull) => T
  winnerIdx?: number
  lowerIsBetter?: boolean
}) {
  return (
    <tr className="border-b border-border/20">
      <td className="py-2 text-xs text-muted-foreground">{label}</td>
      {deals.map((d, i) => {
        let cls = "text-foreground"
        if (winnerIdx !== undefined) {
          if (i === winnerIdx) cls = "text-cyan-600 dark:text-cyan-400 font-semibold"
          else if (deals.length === 3) {
            // Find the worst index and colour red
            const sorted = [...deals].map((_, j) => j).sort((a, b) => {
              const va = Number(String(get(deals[a])).replace(/[£,%+]/g, ""))
              const vb = Number(String(get(deals[b])).replace(/[£,%+]/g, ""))
              return lowerIsBetter ? va - vb : vb - va
            })
            if (sorted[sorted.length - 1] === i) cls = "text-red-600 dark:text-red-400"
          }
        }
        return (
          <td key={d.id} className={`py-2 text-sm tabular-nums ${cls}`}>
            {String(get(d))}
          </td>
        )
      })}
    </tr>
  )
}

function VerdictLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/20 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  )
}

// ── Winner / recommendation logic ─────────────────────────────────────

function bestIdx(deals: SavedDealFull[], fn: (d: SavedDealFull) => number): number {
  let best = 0
  let bestVal = fn(deals[0])
  for (let i = 1; i < deals.length; i++) {
    const v = fn(deals[i])
    if (v > bestVal) { best = i; bestVal = v }
  }
  return best
}
function lowestIdx(deals: SavedDealFull[], fn: (d: SavedDealFull) => number): number {
  let best = 0
  let bestVal = fn(deals[0])
  for (let i = 1; i < deals.length; i++) {
    const v = fn(deals[i])
    if (v < bestVal) { best = i; bestVal = v }
  }
  return best
}

function computeWinners(deals: SavedDealFull[]) {
  return {
    dealScore: bestIdx(deals, (d) => d.scoreResult.total),
    grossYield: bestIdx(deals, (d) => d.results.grossYield),
    netYield: bestIdx(deals, (d) => d.results.netYield),
    monthlyCashflow: bestIdx(deals, (d) => d.results.monthlyCashFlow),
    annualCashflow: bestIdx(deals, (d) => d.results.annualCashFlow),
    cashOnCash: bestIdx(deals, (d) => d.results.cashOnCashReturn),
    totalCapital: lowestIdx(deals, (d) => d.results.totalCapitalRequired),
  }
}

function computeRecommendation(deals: SavedDealFull[]) {
  // Weighted score:
  //   deal score 30%, cashflow 25%, capital required 20% (inverted),
  //   risk flags 25% (deductions per critical flag)
  // Normalise each axis to 0..1 within the set.
  const scores = deals.map((d) => d.scoreResult.total)
  const cfs = deals.map((d) => d.results.monthlyCashFlow)
  const caps = deals.map((d) => d.results.totalCapitalRequired)
  const flags = deals.map((d) => d.scoreResult.criticalFlags.length)

  const sMax = Math.max(...scores) || 1
  const cfMax = Math.max(...cfs) || 1
  const capMin = Math.min(...caps) || 1
  const flagsMax = Math.max(...flags, 1)

  const weighted = deals.map((d, i) => {
    const a = (scores[i] / sMax) * 0.30
    const b = (cfs[i] > 0 ? cfs[i] / cfMax : 0) * 0.25
    const c = (capMin / Math.max(caps[i], 1)) * 0.20
    const dd = (1 - flags[i] / flagsMax) * 0.25
    return a + b + c + dd
  })
  const winnerIdx = bestIdx(deals, (_, i = 0) => weighted[i] ?? 0)

  const winner = deals[winnerIdx]
  const flagsList = winner.scoreResult.criticalFlags
  const rationale = [
    `Highest weighted score across our 4 axes (deal score, cashflow, capital required, risk flags).`,
    flagsList.length === 0
      ? "No critical risk flags raised."
      : `Note: ${flagsList.length} critical flag${flagsList.length === 1 ? "" : "s"} still apply.`,
  ].join(" ")
  return { winnerIdx, rationale }
}
