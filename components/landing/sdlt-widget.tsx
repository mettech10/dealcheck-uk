"use client"

/**
 * SDLT Widget — interactive lead-generator on the landing page.
 *
 * Live calculator with three controls: purchase price, buyer type,
 * residential vs non-residential. Result updates on every input
 * change via useMemo. Sits between Features and Pricing to capture
 * intent ("they're already thinking about SDLT → invite them to
 * run a full analysis").
 *
 * Uses the shared `calculateSDLT` from lib/calculations.ts — same
 * engine as the /analyse flow and /tools/sdlt-calculator, so figures
 * are guaranteed consistent.
 */

import Link from "next/link"
import { useMemo, useState } from "react"
import { Calculator, ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { calculateSDLT, formatCurrency } from "@/lib/calculations"
import type { BuyerType } from "@/lib/types"

export function SdltWidget() {
  const [priceStr, setPriceStr] = useState("250000")
  const [buyerType, setBuyerType] = useState<BuyerType>("additional")
  const [rateType, setRateType] = useState<"residential" | "non-residential">("residential")

  const price = Math.max(0, Number(priceStr.replace(/,/g, "")) || 0)
  const result = useMemo(
    () => calculateSDLT(price, buyerType, rateType),
    [price, buyerType, rateType],
  )
  const effectiveRate = price > 0 ? (result.total / price) * 100 : 0

  return (
    <section className="border-t border-border/40 bg-gradient-to-b from-background to-background/60 py-20 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" />
            Free tool — no sign-up
          </div>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Try it — calculate your SDLT
          </h2>
          <p className="max-w-xl text-pretty text-sm text-muted-foreground">
            Apr 2025 rates · England &amp; Northern Ireland · all buyer types
          </p>
        </div>

        <Card className="mx-auto max-w-3xl border-primary/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="size-4 text-primary" />
              SDLT Calculator
            </CardTitle>
            <CardDescription>Results update as you type</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-1.5 md:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Purchase Price
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    £
                  </span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    className="pl-7"
                    value={priceStr}
                    onChange={(e) =>
                      setPriceStr(e.target.value.replace(/[^\d]/g, ""))
                    }
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Buyer Type
                </label>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={buyerType}
                  onChange={(e) => setBuyerType(e.target.value as BuyerType)}
                >
                  <option value="first-time">First-time buyer</option>
                  <option value="standard">Standard residential</option>
                  <option value="additional">Investment / Additional home</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Property Type
                </label>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={rateType}
                  onChange={(e) =>
                    setRateType(e.target.value as "residential" | "non-residential")
                  }
                >
                  <option value="residential">Residential</option>
                  <option value="non-residential">Non-residential / Mixed</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Your SDLT
                </span>
                <span className="text-3xl font-bold tabular-nums text-primary">
                  {formatCurrency(result.total)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Effective rate {effectiveRate.toFixed(2)}%
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild variant="outline" size="sm">
                  <Link href="/tools/sdlt-calculator">Full calculator</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={`/analyse?purchasePrice=${price}&buyerType=${buyerType}`}>
                    Get the full analysis
                    <ArrowRight className="ml-1.5 size-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
