import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { getSessionUser } from "@/lib/apiAuth"
import { fetchLtdCoCompare } from "@/lib/ltdCoBackend"
import type { LtdCoCompareInput, LtdCoCompareResult } from "@/lib/ltdCoCompare"

/**
 * POST /api/tools/ltd-co-compare
 * Also served at /api/v1/ltd-co/compare and rewritten from /v1/ltd-co/compare.
 *
 * Proxies to Flask POST /v1/ltd-co/compare on BACKEND_API_URL. Falls back
 * to the local engine when the BE route is not deployed yet.
 *
 * Public (no auth) so it can lead-generate like SDLT. When `dealId` is
 * present AND the caller owns that saved analysis, the result is attached
 * as `ltd_co_compare` on the deal.
 */

const dealSchema = z.object({
  annualGrossRent: z.number().min(0).max(50_000_000),
  annualOperatingCosts: z.number().min(0).max(50_000_000),
  annualFinanceCosts: z.number().min(0).max(50_000_000),
  rentGrowthPercent: z.number().min(-20).max(30),
  costGrowthPercent: z.number().min(-20).max(30),
  financeGrowthPercent: z.number().min(-20).max(30),
  purchasePrice: z.number().min(0).max(50_000_000),
})

const personalSchema = z.object({
  otherTaxableIncome: z.number().min(0).max(50_000_000),
  region: z.enum(["england-ni", "scotland", "wales"]),
})

const companySchema = z.object({
  associatedCompanies: z.number().int().min(0).max(50),
  annualAccountancyCost: z.number().min(0).max(1_000_000),
  otherCompanyProfits: z.number().min(0).max(50_000_000),
  setupCostYear1: z.number().min(0).max(1_000_000),
})

const horizonSchema = z.object({
  years: z.number().int().min(1).max(30),
  discountRatePercent: z.number().min(0).max(30),
})

const bodySchema = z.object({
  mode: z.enum(["landlord", "broker"]).optional(),
  dealId: z.string().uuid().optional().nullable(),
  deal: dealSchema,
  personal: personalSchema,
  company: companySchema,
  horizon: horizonSchema,
})

export async function POST(req: Request) {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const input: LtdCoCompareInput = {
    mode: parsed.data.mode ?? "landlord",
    deal: parsed.data.deal,
    personal: parsed.data.personal,
    company: parsed.data.company,
    horizon: parsed.data.horizon,
    dealId: parsed.data.dealId ?? null,
  }

  const { ltdCoCompare, source } = await fetchLtdCoCompare(input)

  let attachedToDealId: string | null = null
  const dealId = parsed.data.dealId ?? null
  if (dealId) {
    attachedToDealId = await attachToDeal(dealId, ltdCoCompare)
  }

  return NextResponse.json({
    success: true,
    ltdCoCompare,
    attachedToDealId,
    source,
  })
}

async function attachToDeal(
  dealId: string,
  ltdCoCompare: LtdCoCompareResult,
): Promise<string | null> {
  try {
    const user = await getSessionUser()
    if (!user) return null

    const admin = createAdminClient()
    const { data: owned, error: lookupError } = await admin
      .from("saved_analyses")
      .select("id")
      .eq("id", dealId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (lookupError || !owned) return null

    const { error: updateError } = await admin
      .from("saved_analyses")
      .update({
        ltd_co_compare: ltdCoCompare,
        ltd_co_compare_at: new Date().toISOString(),
      })
      .eq("id", dealId)
      .eq("user_id", user.id)

    if (updateError) {
      console.error("[POST /v1/ltd-co/compare] attach failed:", updateError)
      return null
    }
    return dealId
  } catch (err) {
    console.error("[POST /v1/ltd-co/compare] attach skipped:", err)
    return null
  }
}
