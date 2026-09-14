"use client"

/**
 * /tools/personal-vs-ltd — landlord MVP.
 *
 * Inputs: deal economics, personal tax profile, company profile, horizon.
 * Outputs: year-1 after-tax, cumulative, NPV, break-even, soft lean only.
 * Dual lenses: entity retained vs owner extracted.
 * Sticky disclaimer: educational only, not advice.
 * Wired to POST /v1/ltd-co/compare (proxies Flask BE calc API; local fallback).
 * E&NI-first; Scotland/Wales is a flag only.
 * Broker mode is structure-only (unavailable slots). No screener / MTD /
 * compliance / licensing.
 */

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  Building2,
  Info,
  Loader2,
  Lock,
  Scale,
  AlertTriangle,
  CheckCircle2,
  Landmark,
  User,
} from "lucide-react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ToolsTopBar } from "@/components/tools/tools-top-bar"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { formatCurrency } from "@/lib/calculations"
import {
  DEFAULT_LTD_CO_INPUT,
  LTD_CO_DISCLAIMER,
  LTD_CO_DISCLAIMER_WALL,
  LTD_CO_TAX_YEAR,
  type CalculatorMode,
  type LtdCoCompareInput,
  type LtdCoCompareResult,
  type LeanSide,
  type UkRegion,
} from "@/lib/ltdCoCompare"
import type { LtdCoCalcSource } from "@/lib/ltdCoBackend"

const DISCLAIMER_STORAGE_KEY = "metalyzi.ltd-co.disclaimer-v1"

type Lens = "retained" | "extracted"

function num(raw: string): number {
  const n = Number(String(raw).replace(/,/g, ""))
  return Number.isFinite(n) ? n : 0
}

function fromDefaults() {
  const d = DEFAULT_LTD_CO_INPUT
  return {
    annualGrossRent: String(d.deal.annualGrossRent),
    annualOperatingCosts: String(d.deal.annualOperatingCosts),
    annualFinanceCosts: String(d.deal.annualFinanceCosts),
    purchasePrice: String(d.deal.purchasePrice),
    rentGrowthPercent: String(d.deal.rentGrowthPercent),
    costGrowthPercent: String(d.deal.costGrowthPercent),
    financeGrowthPercent: String(d.deal.financeGrowthPercent),
    otherTaxableIncome: String(d.personal.otherTaxableIncome),
    region: d.personal.region as UkRegion,
    associatedCompanies: String(d.company.associatedCompanies),
    annualAccountancyCost: String(d.company.annualAccountancyCost),
    otherCompanyProfits: String(d.company.otherCompanyProfits),
    setupCostYear1: String(d.company.setupCostYear1),
    years: String(d.horizon.years),
    discountRatePercent: String(d.horizon.discountRatePercent),
  }
}

type FormFields = ReturnType<typeof fromDefaults>

function toInput(fields: FormFields, mode: CalculatorMode, dealId: string | null): LtdCoCompareInput {
  return {
    mode,
    dealId,
    deal: {
      annualGrossRent: num(fields.annualGrossRent),
      annualOperatingCosts: num(fields.annualOperatingCosts),
      annualFinanceCosts: num(fields.annualFinanceCosts),
      rentGrowthPercent: num(fields.rentGrowthPercent),
      costGrowthPercent: num(fields.costGrowthPercent),
      financeGrowthPercent: num(fields.financeGrowthPercent),
      purchasePrice: num(fields.purchasePrice),
    },
    personal: {
      otherTaxableIncome: num(fields.otherTaxableIncome),
      region: fields.region,
    },
    company: {
      associatedCompanies: Math.max(0, Math.floor(num(fields.associatedCompanies))),
      annualAccountancyCost: num(fields.annualAccountancyCost),
      otherCompanyProfits: num(fields.otherCompanyProfits),
      setupCostYear1: num(fields.setupCostYear1),
    },
    horizon: {
      years: Math.min(30, Math.max(1, Math.floor(num(fields.years)) || 1)),
      discountRatePercent: num(fields.discountRatePercent),
    },
  }
}

export function PersonalVsLtdCalculator() {
  const searchParams = useSearchParams()
  const dealIdParam = searchParams.get("dealId")
  const dealId =
    dealIdParam &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      dealIdParam,
    )
      ? dealIdParam
      : null
  const understoodParam = searchParams.get("understood") === "1"
  const continueHref = (() => {
    const next = new URLSearchParams(searchParams.toString())
    next.set("understood", "1")
    return `/tools/personal-vs-ltd?${next.toString()}`
  })()

  const [fields, setFields] = useState<FormFields>(() => {
    const base = fromDefaults()
    const rent = searchParams.get("annualGrossRent")
    const op = searchParams.get("annualOperatingCosts")
    const fin = searchParams.get("annualFinanceCosts")
    const price = searchParams.get("purchasePrice")
    if (rent) base.annualGrossRent = rent.replace(/[^\d.]/g, "")
    if (op) base.annualOperatingCosts = op.replace(/[^\d.]/g, "")
    if (fin) base.annualFinanceCosts = fin.replace(/[^\d.]/g, "")
    if (price) base.purchasePrice = price.replace(/[^\d.]/g, "")
    return base
  })
  const [mode, setMode] = useState<CalculatorMode>("landlord")
  const [lens, setLens] = useState<Lens>("retained")
  const [result, setResult] = useState<LtdCoCompareResult | null>(null)
  const [calcSource, setCalcSource] = useState<LtdCoCalcSource | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachedToDealId, setAttachedToDealId] = useState<string | null>(null)
  const [dealLabel, setDealLabel] = useState<string | null>(null)
  const [prefillReady, setPrefillReady] = useState(!dealId)
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(understoodParam)

  const setField = <K extends keyof FormFields>(key: K, value: FormFields[K]) => {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const runCompare = useCallback(
    async (nextFields: FormFields, nextMode: CalculatorMode) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/v1/ltd-co/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toInput(nextFields, nextMode, dealId)),
        })
        const json = (await res.json().catch(() => null)) as {
          success?: boolean
          ltdCoCompare?: LtdCoCompareResult
          attachedToDealId?: string | null
          source?: LtdCoCalcSource
          error?: string
        } | null
        if (!res.ok || !json?.ltdCoCompare) {
          setError(json?.error || "Could not run the comparison.")
          return
        }
        setResult(json.ltdCoCompare)
        setAttachedToDealId(json.attachedToDealId ?? null)
        setCalcSource(json.source ?? null)
      } catch {
        setError("Could not reach the calculator. Try again.")
      } finally {
        setLoading(false)
      }
    },
    [dealId],
  )

  useEffect(() => {
    let cancelled = false
    async function hydrateFromDeal() {
      if (!dealId) {
        setPrefillReady(true)
        return
      }
      try {
        const res = await fetch(`/api/analyses/${dealId}`)
        if (!res.ok) {
          if (!cancelled) setPrefillReady(true)
          return
        }
        const data = (await res.json()) as {
          address?: string
          form_data?: { monthlyRent?: number; purchasePrice?: number }
          results?: {
            monthlyIncome?: number
            annualRunningCosts?: number
            annualMortgageCost?: number
          }
          ltd_co_compare?: LtdCoCompareResult | null
        }
        if (cancelled) return
        if (data.address) setDealLabel(data.address)
        setFields((prev) => {
          const next = { ...prev }
          const rent =
            data.results?.monthlyIncome && data.results.monthlyIncome > 0
              ? data.results.monthlyIncome * 12
              : (data.form_data?.monthlyRent ?? 0) * 12
          if (rent > 0) next.annualGrossRent = String(Math.round(rent))
          if (data.results?.annualRunningCosts != null) {
            next.annualOperatingCosts = String(
              Math.round(data.results.annualRunningCosts),
            )
          }
          if (data.results?.annualMortgageCost != null) {
            next.annualFinanceCosts = String(
              Math.round(data.results.annualMortgageCost),
            )
          }
          if (data.form_data?.purchasePrice) {
            next.purchasePrice = String(Math.round(data.form_data.purchasePrice))
          }
          return next
        })
        if (data.ltd_co_compare?.years?.length) {
          setResult(data.ltd_co_compare)
        }
      } catch {
        /* prefill is best-effort */
      } finally {
        if (!cancelled) setPrefillReady(true)
      }
    }
    hydrateFromDeal()
    return () => {
      cancelled = true
    }
  }, [dealId])

  useEffect(() => {
    try {
      if (understoodParam) {
        sessionStorage.setItem(DISCLAIMER_STORAGE_KEY, "1")
        setDisclaimerAccepted(true)
        const next = new URLSearchParams(searchParams.toString())
        next.delete("understood")
        const qs = next.toString()
        window.history.replaceState(
          null,
          "",
          qs ? `/tools/personal-vs-ltd?${qs}` : "/tools/personal-vs-ltd",
        )
        return
      }
      if (sessionStorage.getItem(DISCLAIMER_STORAGE_KEY) === "1") {
        setDisclaimerAccepted(true)
      }
    } catch {
      if (understoodParam) setDisclaimerAccepted(true)
    }
  }, [understoodParam, searchParams])

  useEffect(() => {
    if (!prefillReady || !disclaimerAccepted) return
    void runCompare(fields, mode)
    // Initial run only — later runs are explicit via Compare.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillReady, disclaimerAccepted])

  const lensSummary = result
    ? lens === "retained"
      ? result.retained
      : result.extracted
    : null

  const chartData = useMemo(() => {
    if (!result) return []
    return result.years.map((row) => ({
      year: `Y${row.year}`,
      Personal: row.personalCumulative,
      Ltd:
        lens === "retained"
          ? row.ltdRetainedCumulative
          : row.ltdExtractedCumulative,
    }))
  }, [result, lens])

  return (
    <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 pb-28">
      <ToolsTopBar />

      <header className="flex flex-col gap-3">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Scale className="size-6" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Personal vs Ltd Co
            </h1>
            <p className="text-sm text-muted-foreground">
              After-tax illustration for a UK residential landlord — holding
              personally versus in a limited company.
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="w-fit gap-1 text-xs">
                <CheckCircle2 className="size-3 text-emerald-500" />
                {LTD_CO_TAX_YEAR} England &amp; NI rates
              </Badge>
              <Badge variant="outline" className="w-fit text-xs">
                Educational only · not advice
              </Badge>
              {dealLabel && (
                <Badge variant="outline" className="w-fit text-xs">
                  Deal: {dealLabel}
                </Badge>
              )}
              {attachedToDealId && (
                <Badge variant="outline" className="w-fit gap-1 text-xs">
                  Saved against this deal
                </Badge>
              )}
              {calcSource === "backend" && (
                <Badge variant="outline" className="w-fit text-xs">
                  Backend calc API
                </Badge>
              )}
              {calcSource === "local-fallback" && (
                <Badge variant="outline" className="w-fit text-xs">
                  Local engine (backend calc API unavailable)
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      {!disclaimerAccepted ? (
        <DisclaimerWall
          continueHref={continueHref}
          onAccept={() => {
            try {
              sessionStorage.setItem(DISCLAIMER_STORAGE_KEY, "1")
            } catch {
              /* ignore */
            }
            setDisclaimerAccepted(true)
          }}
        />
      ) : (
        <>
      <ModeToggle mode={mode} onChange={setMode} />

      {mode === "broker" && <BrokerPlaceholder />}

      {dealId && !attachedToDealId && (
        <p className="text-xs text-muted-foreground">
          This comparison can be attached to your saved deal when you are signed
          in.{" "}
          <Link
            href={`/login?returnTo=${encodeURIComponent(`/tools/personal-vs-ltd?dealId=${dealId}`)}`}
            className="underline"
          >
            Sign in
          </Link>
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Deal economics</CardTitle>
              <CardDescription>Annual figures for one rental</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <PoundField
                id="purchasePrice"
                label="Purchase price"
                hint="Used by the calc API for SDLT / capital (year 0)"
                value={fields.purchasePrice}
                onChange={(v) => setField("purchasePrice", v)}
              />
              <PoundField
                id="annualGrossRent"
                label="Gross rent"
                value={fields.annualGrossRent}
                onChange={(v) => setField("annualGrossRent", v)}
              />
              <PoundField
                id="annualOperatingCosts"
                label="Operating costs"
                hint="Exclude mortgage interest"
                value={fields.annualOperatingCosts}
                onChange={(v) => setField("annualOperatingCosts", v)}
              />
              <PoundField
                id="annualFinanceCosts"
                label="Finance costs"
                hint="Mortgage interest (s.24 for personal)"
                value={fields.annualFinanceCosts}
                onChange={(v) => setField("annualFinanceCosts", v)}
              />
              <div className="grid grid-cols-3 gap-3">
                <PercentField
                  id="rentGrowthPercent"
                  label="Rent growth"
                  value={fields.rentGrowthPercent}
                  onChange={(v) => setField("rentGrowthPercent", v)}
                />
                <PercentField
                  id="costGrowthPercent"
                  label="Cost growth"
                  value={fields.costGrowthPercent}
                  onChange={(v) => setField("costGrowthPercent", v)}
                />
                <PercentField
                  id="financeGrowthPercent"
                  label="Finance growth"
                  value={fields.financeGrowthPercent}
                  onChange={(v) => setField("financeGrowthPercent", v)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Personal tax profile</CardTitle>
              <CardDescription>Owner, not the company</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <PoundField
                id="otherTaxableIncome"
                label="Other taxable income"
                hint="Salary, pensions and other income this year"
                value={fields.otherTaxableIncome}
                onChange={(v) => setField("otherTaxableIncome", v)}
              />
              <div className="flex flex-col gap-2">
                <Label>Tax region</Label>
                <div className="flex flex-col gap-1.5">
                  {(
                    [
                      { v: "england-ni", l: "England & Northern Ireland" },
                      { v: "scotland", l: "Scotland (flag only)" },
                      { v: "wales", l: "Wales (flag only)" },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.v}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors ${
                        fields.region === opt.v
                          ? "border-primary/60 bg-primary/5"
                          : "border-border/40 hover:border-border/80"
                      }`}
                    >
                      <input
                        type="radio"
                        name="region"
                        value={opt.v}
                        checked={fields.region === opt.v}
                        onChange={() => setField("region", opt.v)}
                        className="size-4 accent-primary"
                      />
                      {opt.l}
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Company profile</CardTitle>
              <CardDescription>SPV / holding company costs</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <PoundField
                id="annualAccountancyCost"
                label="Annual accountancy / admin"
                value={fields.annualAccountancyCost}
                onChange={(v) => setField("annualAccountancyCost", v)}
              />
              <PoundField
                id="setupCostYear1"
                label="Year-1 setup cost"
                hint="Formation, advice, transfer — £0 if already set up"
                value={fields.setupCostYear1}
                onChange={(v) => setField("setupCostYear1", v)}
              />
              <PoundField
                id="otherCompanyProfits"
                label="Other company profits"
                hint="Affects the corporation-tax band"
                value={fields.otherCompanyProfits}
                onChange={(v) => setField("otherCompanyProfits", v)}
              />
              <NumberField
                id="associatedCompanies"
                label="Associated companies (extra)"
                hint="0 = this company only. Splits CT thresholds."
                value={fields.associatedCompanies}
                onChange={(v) => setField("associatedCompanies", v)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Horizon</CardTitle>
              <CardDescription>Holding period and discount rate</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  id="years"
                  label="Years"
                  value={fields.years}
                  onChange={(v) => setField("years", v)}
                />
                <PercentField
                  id="discountRatePercent"
                  label="Discount rate"
                  value={fields.discountRatePercent}
                  onChange={(v) => setField("discountRatePercent", v)}
                />
              </div>
              <Button
                className="w-full gap-2"
                disabled={loading}
                onClick={() => void runCompare(fields, mode)}
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Comparing…
                  </>
                ) : (
                  <>
                    <Scale className="size-4" />
                    Compare structures
                  </>
                )}
              </Button>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-3">
          {result?.flags.devolvedNation && result.flags.devolvedNationNote && (
            <Alert>
              <AlertTriangle />
              <AlertTitle>Devolved nation — flag only</AlertTitle>
              <AlertDescription>{result.flags.devolvedNationNote}</AlertDescription>
            </Alert>
          )}

          {!result && loading && (
            <Card>
              <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Running comparison…
              </CardContent>
            </Card>
          )}

          {result && lensSummary && (
            <>
              <Tabs value={lens} onValueChange={(v) => setLens(v as Lens)}>
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="retained" className="gap-1.5">
                    <Building2 className="size-3.5" />
                    Entity retained
                  </TabsTrigger>
                  <TabsTrigger value="extracted" className="gap-1.5">
                    <User className="size-3.5" />
                    Owner extracted
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="retained" className="mt-4">
                  <p className="mb-3 text-xs text-muted-foreground">
                    Cash left in the company after corporation tax and admin.
                    The owner has not taken a dividend.
                  </p>
                </TabsContent>
                <TabsContent value="extracted" className="mt-4">
                  <p className="mb-3 text-xs text-muted-foreground">
                    Cash the owner takes as a dividend after corporation tax
                    and dividend tax. Assumes the year&apos;s post-CT property
                    profit is paid out.
                  </p>
                </TabsContent>
              </Tabs>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi
                  label="Year-1 after tax"
                  personal={result.personal.year1AfterTax}
                  ltd={lensSummary.year1AfterTax}
                />
                <Kpi
                  label={`Cumulative (${result.years.length}y)`}
                  personal={result.personal.cumulative}
                  ltd={lensSummary.cumulative}
                />
                <Kpi
                  label="NPV"
                  personal={result.personal.npv}
                  ltd={lensSummary.npv}
                />
                <BreakEvenTile
                  year={lensSummary.breakEvenYear}
                  horizon={result.years.length}
                />
              </div>

              <LeanCallout side={lensSummary.lean} copy={lensSummary.copy} delta={lensSummary.cumulativeDelta} />

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Cumulative after-tax cash
                  </CardTitle>
                  <CardDescription>
                    Personal holding vs Ltd ({lens === "retained" ? "retained" : "extracted"})
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-64 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) =>
                          `£${Math.round(v / 1000)}k`
                        }
                      />
                      <RechartsTooltip
                        formatter={(value) => formatCurrency(Number(value ?? 0))}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="Personal"
                        stroke="var(--chart-2)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="Ltd"
                        stroke="var(--chart-1)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Year-by-year</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/40 text-left text-muted-foreground">
                        <th className="py-1.5 pr-3 font-medium">Year</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Personal</th>
                        <th className="py-1.5 pr-3 text-right font-medium">
                          Ltd {lens === "retained" ? "retained" : "extracted"}
                        </th>
                        <th className="py-1.5 text-right font-medium">Cumulative gap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.years.map((row) => {
                        const ltd =
                          lens === "retained"
                            ? row.ltdRetainedAfterTax
                            : row.ltdExtractedAfterTax
                        const ltdCum =
                          lens === "retained"
                            ? row.ltdRetainedCumulative
                            : row.ltdExtractedCumulative
                        const gap = ltdCum - row.personalCumulative
                        return (
                          <tr key={row.year} className="border-t border-border/30">
                            <td className="py-1.5 pr-3 text-muted-foreground">{row.year}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">
                              {formatCurrency(row.personalAfterTax)}
                            </td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">
                              {formatCurrency(ltd)}
                            </td>
                            <td
                              className={`py-1.5 text-right tabular-nums ${
                                gap > 0
                                  ? "text-foreground"
                                  : gap < 0
                                    ? "text-muted-foreground"
                                    : ""
                              }`}
                            >
                              {gap > 0 ? "+" : ""}
                              {formatCurrency(gap)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Assumptions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
                    {result.assumptions.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
        </>
      )}

      {disclaimerAccepted && <StickyDisclaimer />}
    </div>
  )
}

function DisclaimerWall({
  continueHref,
  onAccept,
}: {
  continueHref: string
  onAccept: () => void
}) {
  useEffect(() => {
    document.body.setAttribute("data-ltd-co-disclaimer-wall", "1")
    return () => {
      document.body.removeAttribute("data-ltd-co-disclaimer-wall")
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-start justify-center overflow-y-auto bg-background/95 px-4 py-10 backdrop-blur-sm"
      data-testid="ltd-co-disclaimer-wall"
      role="dialog"
      aria-labelledby="ltd-co-disclaimer-title"
      aria-modal="true"
    >
      <Card className="relative z-[10051] w-full max-w-2xl border-primary/40 shadow-xl">
        <CardHeader>
          <CardTitle id="ltd-co-disclaimer-title" className="text-lg">
            Before you use this calculator
          </CardTitle>
          <CardDescription>
            Educational illustration only — not advice. Please read and confirm.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <a
            id="ltd-co-disclaimer-continue"
            href={continueHref}
            className={cn(buttonVariants(), "relative z-[10052] w-fit")}
            onClick={onAccept}
          >
            I understand — continue to the calculator
          </a>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {LTD_CO_DISCLAIMER_WALL.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: CalculatorMode
  onChange: (m: CalculatorMode) => void
}) {
  return (
    <div className="inline-flex w-fit rounded-lg border border-border/40 bg-muted/40 p-1 text-sm">
      <button
        type="button"
        onClick={() => onChange("landlord")}
        className={`rounded-md px-3 py-1.5 ${
          mode === "landlord"
            ? "bg-background font-medium text-foreground shadow-sm"
            : "text-muted-foreground"
        }`}
      >
        Landlord
      </button>
      <button
        type="button"
        onClick={() => onChange("broker")}
        className={`rounded-md px-3 py-1.5 ${
          mode === "broker"
            ? "bg-background font-medium text-foreground shadow-sm"
            : "text-muted-foreground"
        }`}
      >
        Broker
      </button>
    </div>
  )
}

function BrokerPlaceholder() {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Broker workspace</CardTitle>
        <CardDescription>
          Structure only in this release — client packs, multi-deal overlays and
          adviser notes are not built yet. The landlord comparison below still
          runs.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { title: "Client packs", body: "Branded comparison packs for a named client." },
          { title: "Multi-deal overlay", body: "Stack several rentals into one view." },
          { title: "Adviser notes", body: "Private notes alongside the illustration." },
        ].map((slot) => (
          <div
            key={slot.title}
            className="flex flex-col gap-1 rounded-lg border border-border/40 bg-muted/20 px-3 py-3"
          >
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Lock className="size-3.5 text-muted-foreground" />
              {slot.title}
            </div>
            <p className="text-xs text-muted-foreground">{slot.body}</p>
            <span className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Unavailable
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function Kpi({
  label,
  personal,
  ltd,
}: {
  label: string
  personal: number
  ltd: number
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/40 bg-background/40 px-3 py-2.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-[11px] text-muted-foreground">Personal</span>
      <span className="text-lg font-bold tabular-nums text-foreground">
        {formatCurrency(personal)}
      </span>
      <span className="text-[11px] text-muted-foreground">Ltd</span>
      <span className="text-lg font-bold tabular-nums text-primary">
        {formatCurrency(ltd)}
      </span>
    </div>
  )
}

function BreakEvenTile({
  year,
  horizon,
}: {
  year: number | null
  horizon: number
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/40 bg-background/40 px-3 py-2.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Break-even
      </span>
      <span className="text-[11px] text-muted-foreground">Ltd overtakes personal</span>
      <span className="text-lg font-bold tabular-nums text-foreground">
        {year ? `Year ${year}` : "Not in horizon"}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {year
          ? `First year Ltd cumulative is higher`
          : `Ltd does not overtake within ${horizon} years`}
      </span>
    </div>
  )
}

function LeanCallout({
  side,
  copy,
  delta,
}: {
  side: LeanSide
  copy: string
  delta: number
}) {
  const label =
    side === "close"
      ? "Too close to call"
      : side === "ltd"
        ? "Soft lean — company structure"
        : "Soft lean — personal holding"
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-card/60 p-4">
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <p className="text-sm text-muted-foreground">{copy}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          Cumulative gap at horizon: {delta > 0 ? "+" : ""}
          {formatCurrency(delta)} (Ltd − personal)
        </p>
      </div>
    </div>
  )
}

function StickyDisclaimer() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/40 bg-background/90 px-4 py-2.5 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-start gap-2 text-[11px] leading-snug text-muted-foreground">
        <Landmark className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {LTD_CO_DISCLAIMER}{" "}
          <Link href="/disclaimer" className="underline hover:text-foreground">
            Full disclaimer
          </Link>
          .
        </span>
      </div>
    </div>
  )
}

function PoundField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          £
        </span>
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          className="pl-7"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        />
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function PercentField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          className="pr-7"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.-]/g, ""))}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          %
        </span>
      </div>
    </div>
  )
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
