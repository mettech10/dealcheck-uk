import { NextResponse } from "next/server"
import { z } from "zod"
import { toIncorporationPayload } from "@/lib/ltdCoIncorporation"

/**
 * POST /api/v1/ltd-co/incorporation
 *
 * Proxies to Flask POST /v1/ltd-co/incorporation. Public like the
 * new-purchase compare (pure calculation, no paid APIs).
 */

const BACKEND_API_URL =
  process.env.BACKEND_API_URL || "https://metusa-deal-analyzer.onrender.com"

const money = z.number().min(0).max(50_000_000)
const pct = z.number().min(0).max(30)

const bodySchema = z.object({
  marketValue: money,
  originalPurchasePrice: money,
  purchaseCosts: money,
  capitalImprovements: money,
  outstandingMortgage: money,
  monthlyRent: z.number().min(0).max(1_000_000),
  annualOperatingExpenses: money,
  otherTaxableIncome: money,
  otherGainsThisYear: money,
  personalInterestRatePercent: pct,
  companyInterestRatePercent: pct,
  earlyRepaymentCharge: money,
  refinanceFees: money,
  transferLegalFees: money,
  annualAccountancyCost: money,
  incorporationRelief: z.boolean(),
  partnershipSdltRelief: z.boolean(),
  horizonYears: z.number().int().min(1).max(30),
  discountRatePercent: pct,
})

export async function POST(req: Request) {
  const json = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the figures and try again." }, { status: 400 })
  }
  try {
    const res = await fetch(`${BACKEND_API_URL.replace(/\/$/, "")}/v1/ltd-co/incorporation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toIncorporationPayload(parsed.data)),
      signal: AbortSignal.timeout(60_000),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const message = typeof body.error === "string" ? body.error : "The calculation service rejected these figures."
      return NextResponse.json({ error: message }, { status: res.status === 400 ? 400 : 502 })
    }
    return NextResponse.json(body)
  } catch {
    return NextResponse.json(
      { error: "The calculation service is unavailable. Try again shortly." },
      { status: 502 },
    )
  }
}
