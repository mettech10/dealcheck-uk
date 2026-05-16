"use client"

/**
 * /tools/sdlt-calculator — open-access SDLT calculator.
 *
 * Pure client-side; uses `calculateSDLT` from lib/calculations.ts so
 * the rates here are guaranteed to match what the main /analyse flow
 * applies. No backend call, no auth, no rate limit — this is the lead
 * generator. Results refresh on every keystroke via useMemo.
 *
 * Rendered sections:
 *   1. Header (badge "Apr 2025 rates")
 *   2. Inputs (price, buyer type, residential vs non-res)
 *   3. Live breakdown (per-band)
 *   4. Headline total + effective rate + remaining-after-SDLT
 *   5. Comparison strip (all 4 buyer types at same price)
 *   6. Full bands tables (informational reference)
 *   7. Share / "Analyse this property" CTAs
 *   8. England-and-NI disclaimer
 */

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  Calculator,
  ArrowLeft,
  ArrowRight,
  Copy,
  CheckCircle2,
  Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { calculateSDLT, formatCurrency } from "@/lib/calculations"
import type { BuyerType } from "@/lib/types"

type RateType = "residential" | "non-residential" | "mixed-use"

export default function SdltCalculatorPage() {
  const [priceStr, setPriceStr] = useState("250000")
  const [buyerType, setBuyerType] = useState<BuyerType>("additional")
  const [rateType, setRateType] = useState<RateType>("residential")
  const [copied, setCopied] = useState(false)

  const price = Math.max(0, Number(priceStr.replace(/,/g, "")) || 0)

  const result = useMemo(
    () => calculateSDLT(price, buyerType, rateType),
    [price, buyerType, rateType],
  )

  const compare = useMemo(
    () => ({
      "first-time": calculateSDLT(price, "first-time", "residential").total,
      standard: calculateSDLT(price, "standard", "residential").total,
      additional: calculateSDLT(price, "additional", "residential").total,
      "non-residential": calculateSDLT(price, "standard", "non-residential").total,
    }),
    [price],
  )

  const effectiveRate = price > 0 ? (result.total / price) * 100 : 0
  const remaining = price - result.total

  const copyResult = async () => {
    const buyerLabel =
      buyerType === "first-time"
        ? "first-time buyer"
        : buyerType === "standard"
          ? "standard residential buyer"
          : "investment / additional home buyer"
    const text = `SDLT for ${formatCurrency(price)} as ${buyerLabel}: ${formatCurrency(result.total)} (effective rate ${effectiveRate.toFixed(2)}%). Calculated via Metalyzi SDLT Calculator — metalyzi.co.uk/tools/sdlt-calculator`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
            <Link href="/tools">
              <ArrowLeft className="size-4" />
              All Tools
            </Link>
          </Button>
        </div>
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Calculator className="size-6" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              SDLT Calculator
            </h1>
            <p className="text-sm text-muted-foreground">
              Stamp Duty Land Tax for England &amp; Northern Ireland
            </p>
            <Badge variant="outline" className="mt-1 w-fit gap-1 text-xs">
              <CheckCircle2 className="size-3 text-emerald-500" />
              Updated for April 2025 rates
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Inputs ────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Your Purchase</CardTitle>
            <CardDescription>Calculations update as you type</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="price">Purchase Price</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  £
                </span>
                <Input
                  id="price"
                  type="text"
                  inputMode="numeric"
                  className="pl-7 text-lg"
                  value={priceStr}
                  onChange={(e) =>
                    setPriceStr(e.target.value.replace(/[^\d]/g, ""))
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Buyer Type</Label>
              <div className="flex flex-col gap-1.5">
                {[
                  { v: "first-time", l: "First-time buyer" },
                  { v: "standard", l: "Standard residential buyer" },
                  { v: "additional", l: "Investment / Additional home (+5% surcharge)" },
                ].map((opt) => (
                  <label
                    key={opt.v}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors ${
                      buyerType === opt.v
                        ? "border-primary/60 bg-primary/5"
                        : "border-border/40 hover:border-border/80"
                    }`}
                  >
                    <input
                      type="radio"
                      name="buyerType"
                      value={opt.v}
                      checked={buyerType === opt.v}
                      onChange={() => setBuyerType(opt.v as BuyerType)}
                      className="size-4 accent-primary"
                    />
                    {opt.l}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Property Type</Label>
              <div className="flex flex-col gap-1.5">
                {[
                  { v: "residential", l: "Residential" },
                  { v: "non-residential", l: "Non-residential / Mixed use" },
                ].map((opt) => (
                  <label
                    key={opt.v}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors ${
                      rateType === opt.v
                        ? "border-primary/60 bg-primary/5"
                        : "border-border/40 hover:border-border/80"
                    }`}
                  >
                    <input
                      type="radio"
                      name="rateType"
                      value={opt.v}
                      checked={rateType === opt.v}
                      onChange={() => setRateType(opt.v as RateType)}
                      className="size-4 accent-primary"
                    />
                    {opt.l}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Result ────────────────────────────────────────── */}
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">SDLT Breakdown</CardTitle>
            <CardDescription>
              Calculated using current HMRC bands
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Per-band breakdown */}
            <div className="flex flex-col gap-1.5">
              {result.breakdown.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No SDLT due at this purchase price.
                </p>
              )}
              {result.breakdown.map((line, i) => (
                <div
                  key={i}
                  className="flex items-baseline justify-between gap-3 rounded-md border border-border/40 bg-background/60 px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">£{line.band}</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatCurrency(line.tax)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-border/40 pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-foreground">
                  Total SDLT
                </span>
                <span className="text-3xl font-bold tabular-nums text-primary">
                  {formatCurrency(result.total)}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between text-xs text-muted-foreground">
                <span>Effective rate</span>
                <span className="tabular-nums">
                  {effectiveRate.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                <span>Remaining after SDLT</span>
                <span className="tabular-nums">
                  {formatCurrency(remaining)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <Button onClick={copyResult} variant="outline" className="flex-1 gap-2">
                {copied ? (
                  <>
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-4" />
                    Copy Result
                  </>
                )}
              </Button>
              <Button asChild className="flex-1 gap-2">
                <Link
                  href={`/analyse?purchasePrice=${price}&buyerType=${buyerType}`}
                >
                  Analyse this Property
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Comparison Strip ──────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            All buyer types at {formatCurrency(price)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <CompareTile label="First-time buyer" value={compare["first-time"]} />
            <CompareTile label="Standard buyer" value={compare.standard} />
            <CompareTile label="Investment buyer" value={compare.additional} highlight={buyerType === "additional"} />
            <CompareTile label="Non-residential" value={compare["non-residential"]} />
          </div>
        </CardContent>
      </Card>

      {/* ── Bands Reference Tables ────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <BandsTable
          title="Investment / Additional Home Buyer"
          subtitle="Apr 2025 rates · +5% surcharge on every band"
          rows={[
            ["£0 – £125,000", "5% (0% + 5% surcharge)"],
            ["£125,001 – £250,000", "7% (2% + 5%)"],
            ["£250,001 – £925,000", "10% (5% + 5%)"],
            ["£925,001 – £1.5m", "15% (10% + 5%)"],
            ["Over £1.5m", "17% (12% + 5%)"],
          ]}
        />
        <BandsTable
          title="Standard Residential"
          subtitle="Replacing primary residence, no surcharge"
          rows={[
            ["£0 – £125,000", "0%"],
            ["£125,001 – £250,000", "2%"],
            ["£250,001 – £925,000", "5%"],
            ["£925,001 – £1.5m", "10%"],
            ["Over £1.5m", "12%"],
          ]}
        />
        <BandsTable
          title="First-Time Buyer Relief"
          subtitle="No FTB relief above £625k threshold"
          rows={[
            ["£0 – £425,000", "0%"],
            ["£425,001 – £625,000", "5%"],
            ["Over £625,000", "Standard rates apply"],
          ]}
        />
        <BandsTable
          title="Non-Residential / Mixed Use"
          subtitle="Commercial bands, no surcharge"
          rows={[
            ["£0 – £150,000", "0%"],
            ["£150,001 – £250,000", "2%"],
            ["Over £250,000", "5%"],
          ]}
        />
      </div>

      {/* ── Disclaimer ────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-card/40 p-4 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          SDLT calculations are based on current HMRC guidance for{" "}
          <strong className="text-foreground">
            England and Northern Ireland only
          </strong>
          . Scotland uses Land and Buildings Transaction Tax (LBTT). Wales uses
          Land Transaction Tax (LTT). Always verify with a qualified solicitor
          before completing.
        </span>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────

function CompareTile({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border px-3 py-2.5 ${
        highlight
          ? "border-primary/60 bg-primary/5"
          : "border-border/40 bg-background/40"
      }`}
    >
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-lg font-bold tabular-nums text-foreground">
        {formatCurrency(value)}
      </span>
    </div>
  )
}

function BandsTable({
  title,
  subtitle,
  rows,
}: {
  title: string
  subtitle: string
  rows: [string, string][]
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-xs">
          <tbody>
            {rows.map(([band, rate]) => (
              <tr key={band} className="border-t border-border/30">
                <td className="py-1.5 pr-3 text-muted-foreground">{band}</td>
                <td className="py-1.5 text-right font-medium text-foreground">
                  {rate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
