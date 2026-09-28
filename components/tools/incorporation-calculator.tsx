"use client"

/**
 * "Already own it?" — the cost of moving an existing rental into a company,
 * and whether the company's running savings pay it back.
 */

import { useState } from "react"
import { Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DEFAULT_INCORPORATION_INPUT,
  validateIncorporationInput,
  type IncorporationInput,
  type IncorporationResult,
} from "@/lib/ltdCoIncorporation"

type NumericKey = {
  [K in keyof IncorporationInput]: IncorporationInput[K] extends number ? K : never
}[keyof IncorporationInput]

const FIELDS: { key: NumericKey; label: string; hint?: string; unit: "£" | "%" | "yrs" }[] = [
  { key: "marketValue", label: "Worth today", unit: "£" },
  { key: "originalPurchasePrice", label: "What you paid", unit: "£" },
  { key: "purchaseCosts", label: "Buying costs then", hint: "Stamp duty and legal fees when you bought", unit: "£" },
  { key: "capitalImprovements", label: "Improvements", hint: "Extensions or upgrades, not repairs", unit: "£" },
  { key: "outstandingMortgage", label: "Mortgage outstanding", unit: "£" },
  { key: "monthlyRent", label: "Monthly rent", unit: "£" },
  { key: "annualOperatingExpenses", label: "Yearly running costs", hint: "Excluding mortgage interest", unit: "£" },
  { key: "otherTaxableIncome", label: "Your other income", hint: "Salary, pension and other income this year", unit: "£" },
  { key: "personalInterestRatePercent", label: "Your mortgage rate", unit: "%" },
  { key: "companyInterestRatePercent", label: "Company mortgage rate", unit: "%" },
  { key: "earlyRepaymentCharge", label: "Early repayment charge", unit: "£" },
  { key: "refinanceFees", label: "Company mortgage fees", unit: "£" },
  { key: "transferLegalFees", label: "Legal fees for the transfer", unit: "£" },
  { key: "annualAccountancyCost", label: "Company accountancy a year", unit: "£" },
  { key: "horizonYears", label: "Years to compare", unit: "yrs" },
]

function gbp(n: number): string {
  const sign = n < 0 ? "-" : ""
  return `${sign}£${Math.round(Math.abs(n)).toLocaleString("en-GB")}`
}

export function IncorporationCalculator() {
  const [fields, setFields] = useState<Record<NumericKey, string>>(
    () =>
      Object.fromEntries(
        FIELDS.map((f) => [f.key, String(DEFAULT_INCORPORATION_INPUT[f.key])]),
      ) as Record<NumericKey, string>,
  )
  const [incorporationRelief, setIncorporationRelief] = useState(false)
  const [partnershipSdltRelief, setPartnershipSdltRelief] = useState(false)
  const [result, setResult] = useState<IncorporationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function input(): IncorporationInput {
    const nums = Object.fromEntries(
      FIELDS.map((f) => [f.key, Number(fields[f.key] || 0)]),
    ) as Record<NumericKey, number>
    return {
      ...DEFAULT_INCORPORATION_INPUT,
      ...nums,
      incorporationRelief,
      partnershipSdltRelief,
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const body = input()
    const invalid = validateIncorporationInput(body)
    if (invalid) {
      setError(invalid)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/v1/ltd-co/incorporation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Couldn't calculate that. Try again.")
      setResult(json as IncorporationResult)
    } catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const t = result?.transfer
  return (
    <section className="flex flex-col gap-4" aria-labelledby="incorporation-heading">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="size-5" />
        </div>
        <div>
          <h2 id="incorporation-heading" className="text-lg font-semibold text-foreground">
            Already own it? The cost of moving it into a company
          </h2>
          <p className="text-sm text-muted-foreground">
            Moving a property you own into your company is a sale at market value: Capital Gains
            Tax, stamp duty and refinancing costs are due up front. This checks whether the
            company&apos;s lower running tax pays that back.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card className="border-border/40">
          <CardContent className="pt-6">
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`inc-${f.key}`}>{f.label}</Label>
                    <div className="relative">
                      {f.unit === "£" && (
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                      )}
                      <Input
                        id={`inc-${f.key}`}
                        inputMode="decimal"
                        className={f.unit === "£" ? "pl-7" : f.unit === "%" ? "pr-7" : undefined}
                        value={fields[f.key]}
                        onChange={(e) =>
                          setFields((prev) => ({ ...prev, [f.key]: e.target.value.replace(/[^\d.]/g, "") }))
                        }
                      />
                      {f.unit === "%" && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      )}
                    </div>
                    {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 rounded-md border border-border/40 p-3">
                <p className="text-xs font-medium text-foreground">Reliefs (off unless you know they apply)</p>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={incorporationRelief}
                    onCheckedChange={(v) => setIncorporationRelief(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Incorporation relief: my letting is run as a business (HMRC&apos;s test is demanding).
                    From 6 April 2026 it must be claimed on your tax return.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={partnershipSdltRelief}
                    onCheckedChange={(v) => setPartnershipSdltRelief(v === true)}
                    className="mt-0.5"
                  />
                  <span>Partnership stamp duty relief: the property is held by a genuine partnership.</span>
                </label>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="w-fit">
                {loading ? "Calculating…" : "Compare keeping vs moving it"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardHeader>
            <CardTitle className="text-base">Result</CardTitle>
            <CardDescription className="text-xs">
              Illustration only, not tax advice. Take regulated advice before moving a property.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {!result || !t ? (
              <p className="text-muted-foreground">Enter your figures and compare.</p>
            ) : (
              <>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Cost of moving it in</p>
                  <p className="text-2xl font-semibold text-foreground">{gbp(t.total)}</p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <li>
                      Capital Gains Tax: {gbp(t.costs.cgt)}
                      {t.cgt.deferredGain > 0 ? ` (gain of ${gbp(t.cgt.deferredGain)} rolled into the shares)` : ` on a gain of ${gbp(t.cgt.gain)}`}
                    </li>
                    <li>Stamp duty (company pays on market value): {gbp(t.costs.sdlt)}</li>
                    <li>Early repayment charge: {gbp(t.costs.earlyRepaymentCharge)}</li>
                    <li>Mortgage and legal fees: {gbp(t.costs.refinanceFees + t.costs.transferLegalFees + t.costs.formationCost)}</li>
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border/40 p-3">
                    <p className="text-[11px] text-muted-foreground">Keep personally (NPV)</p>
                    <p className="font-semibold text-foreground">{gbp(result.npv.pathA)}</p>
                  </div>
                  <div className="rounded-md border border-border/40 p-3">
                    <p className="text-[11px] text-muted-foreground">Move to company (NPV)</p>
                    <p className="font-semibold text-foreground">{gbp(result.npv.pathB)}</p>
                  </div>
                </div>
                <p className="text-xs text-foreground">
                  {result.breakEven.year != null
                    ? `The company catches up in year ${result.breakEven.year}.`
                    : `The company does not earn back the moving cost within ${result.horizonYears} years on these figures.`}{" "}
                  <span className="text-muted-foreground">{result.metadata.rationale}</span>
                </p>
                <ul className="list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
                  {[...t.cgt.notes, ...(t.sdlt.notes ?? []), ...result.metadata.disclaimers].map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
