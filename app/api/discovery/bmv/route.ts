/**
 * POST /api/discovery/bmv  { district: "M14", maxPrice?, minBedrooms?, ... }
 *
 * Runs the full BMV/BRR hunt for one district and returns the single best
 * below-market candidate (or null, with the reasons why nothing qualified).
 *
 * Admin-gated: it drives live scrapes, so it is not something a normal user
 * can trigger. Long-running by nature — sold comps plus active listings plus a
 * comps valuation per listing — hence maxDuration.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isAdminEmail } from "@/lib/admin"
import { findBestBmvDeal } from "@/lib/discovery/bmvFinder"

export const runtime = "nodejs"
export const maxDuration = 300
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 })
  }

  const district = String(body.district ?? "").trim()
  if (!district) {
    return NextResponse.json({ error: "district is required" }, { status: 400 })
  }

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)

  try {
    const result = await findBestBmvDeal(district, {
      maxListings: num(body.maxListings),
      maxSoldComps: num(body.maxSoldComps),
      minPrice: num(body.minPrice),
      maxPrice: num(body.maxPrice),
      minBedrooms: num(body.minBedrooms),
      maxBedrooms: num(body.maxBedrooms),
      soldMonths: num(body.soldMonths),
    })

    return NextResponse.json({
      district: result.district,
      best: result.best
        ? {
            address: result.best.listing.address,
            postcode: result.best.listing.postcode,
            url: result.best.listing.listingUrl,
            askingPrice: result.best.listing.price,
            bedrooms: result.best.listing.bedrooms,
            propertyType: result.best.listing.propertyType,
            arv: result.best.valuation.arv,
            discountPct: result.best.discountPct,
            estimatedEquityGain: result.best.estimatedEquityGain,
            compCount: result.best.valuation.compCount,
            confidence: result.best.valuation.confidence,
            pricePerSqft: result.best.valuation.pricePerSqft,
            // The comps behind the number, so the figure is checkable.
            comps: result.best.valuation.comps.slice(0, 8).map((c) => ({
              address: c.address,
              soldPrice: c.soldPrice,
              soldDate: c.soldDate,
              distanceM: Math.round(c.distanceM),
              bedrooms: c.bedrooms,
            })),
            adjustments: result.best.valuation.adjustments,
          }
        : null,
      runnerUpCount: Math.max(0, result.candidates.length - 1),
      stats: {
        soldCompsIngested: result.soldCompsIngested,
        activeListingsScanned: result.activeListingsScanned,
        valued: result.valued,
      },
      notes: result.notes,
      // Truncated: enough to explain a null result without dumping everything.
      rejected: result.rejected.slice(0, 20),
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error("[api/discovery/bmv] failed:", err)
    return NextResponse.json({ error: "bmv hunt failed", detail }, { status: 500 })
  }
}
