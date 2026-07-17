import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/apiAuth"
import { createAdminClient } from "@/lib/supabase/admin"
import { mapPropertyType } from "@/lib/propertydata"
import { cachedGetSoldPrices, cachedGetAskingPrices } from "@/lib/propertydata-cache"
import { scrapeRightmoveSold } from "@/lib/scrapers/rightmove-sold-scraper"

const FLASK_URL = process.env.BACKEND_API_URL || "https://metusa-deal-analyzer.onrender.com"

/**
 * Sold Comparables — /api/comparables/sold
 *
 * Primary: Rightmove SOLD listings (Bright Data scrape, type-matched, with
 *          photos + deep links) — cached 7 days in Supabase scraper_cache.
 *          Requires MIN_RIGHTMOVE_COMPS results to stand alone; the same
 *          rows drive the House Valuation average.
 * Fallback: PropertyData /sold-prices (Land Registry) when the scrape is
 *           thin/unavailable, then Flask /api/sold-prices as a last resort.
 *
 * The asking-price valuation estimate is a PropertyData bonus on every path.
 */

// Scraping Browser sessions can take a while on cold areas.
export const maxDuration = 120
export const runtime = "nodejs"

const RM_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MIN_RIGHTMOVE_COMPS = 3

interface SaleRow {
  price: number
  date: string
  street: string
  propertyType?: string
  tenure?: string
  bedrooms?: number | null
  distance?: number | null
  imageUrl?: string | null
  listingUrl?: string | null
}

interface SoldPayload {
  sales: SaleRow[]
  average: number
  count: number
  radiusMiles?: number | null
}

function tryAdminClient() {
  try {
    return createAdminClient()
  } catch {
    console.warn("[SOLD-ROUTE] Supabase admin env missing — cache disabled")
    return null
  }
}

async function fetchValuationEstimate(postcode: string, bedrooms?: number) {
  try {
    const pdPrices = await cachedGetAskingPrices(postcode, bedrooms)
    if (pdPrices && pdPrices.status === "success" && pdPrices.data) {
      return {
        average: pdPrices.data.average,
        range: pdPrices.data["100pc_range"],
        count: pdPrices.data.points_analysed,
      }
    }
  } catch {
    // Non-critical — valuation estimate is a bonus
  }
  return null
}

export async function POST(req: Request) {
  const sessionUser = await getSessionUser()
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { postcode, bedrooms, propertyTypeDetail, propertyType, tenureType } = body

    if (!postcode) {
      return NextResponse.json(
        { success: false, message: "Postcode is required" },
        { status: 400 }
      )
    }

    // ── Primary: Rightmove sold listings ───────────────────────────────
    const district = String(postcode).split(" ")[0].toUpperCase()
    const rmType = (propertyTypeDetail || propertyType || "any") as string
    const cacheKey = `rm_sold_comps_${district}_${rmType}_${bedrooms ?? "any"}`
    const supabase = tryAdminClient()

    let rmPayload: SoldPayload | null = null
    let rmFromCache = false

    if (supabase) {
      const { data: cached } = await supabase
        .from("scraper_cache")
        .select("data, created_at")
        .eq("cache_key", cacheKey)
        .maybeSingle()
      if (cached?.data) {
        const age = Date.now() - new Date(cached.created_at).getTime()
        if (age < RM_CACHE_TTL_MS) {
          rmPayload = cached.data as SoldPayload
          rmFromCache = true
          console.log(`[SOLD-ROUTE] Rightmove cache hit (${Math.round(age / 3600000)}h old)`, { cacheKey })
        }
      }
    }

    if (!rmPayload) {
      const listings = await scrapeRightmoveSold({
        postcode,
        propertyType: propertyTypeDetail || propertyType,
        minBedrooms: bedrooms ? Math.max(0, bedrooms - 1) : undefined,
        maxBedrooms: bedrooms ? bedrooms + 1 : undefined,
        soldInMonths: 24,
        maxResults: 12,
      })
      if (listings.length > 0) {
        const sales: SaleRow[] = listings.map((l) => ({
          price: l.price,
          date: l.dateSold,
          street: l.address,
          propertyType: l.propertyType,
          tenure: l.tenure !== "unknown" ? l.tenure : undefined,
          bedrooms: l.bedrooms ?? null,
          imageUrl: l.thumbnailUrl,
          listingUrl: l.listingUrl || null,
        }))
        const prices = sales.map((s) => s.price).filter((p) => p > 0)
        rmPayload = {
          sales,
          average: prices.length
            ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
            : 0,
          count: sales.length,
        }
        // Only cache sets that are big enough to be served — a thin scrape
        // shouldn't pin the fallback out for 7 days.
        if (supabase && sales.length >= MIN_RIGHTMOVE_COMPS) {
          const { error: cacheErr } = await supabase.from("scraper_cache").upsert(
            {
              cache_key: cacheKey,
              data: rmPayload,
              source: "rightmove_sold",
              created_at: new Date().toISOString(),
            },
            { onConflict: "cache_key" },
          )
          if (cacheErr) console.warn("[SOLD-ROUTE] cache write failed:", cacheErr.message)
        }
      }
    }

    if (rmPayload && rmPayload.count >= MIN_RIGHTMOVE_COMPS) {
      console.log(
        `[SOLD-ROUTE] Rightmove sold primary — ${rmPayload.count} sales, avg ${rmPayload.average}${rmFromCache ? " (cached)" : ""}`,
      )
      const valuationEstimate = await fetchValuationEstimate(postcode, bedrooms)
      return NextResponse.json({
        success: true,
        source: "rightmove_sold",
        fromCache: rmFromCache,
        data: rmPayload,
        valuationEstimate,
      })
    }

    console.log(
      `[SOLD-ROUTE] Rightmove returned ${rmPayload?.count ?? 0} (<${MIN_RIGHTMOVE_COMPS}) — falling back to Land Registry`,
    )

    // ── Fallback 1: PropertyData /sold-prices (Land Registry) ──────────
    const pdSold = await cachedGetSoldPrices(postcode, bedrooms)

    if (pdSold && pdSold.status === "success" && pdSold.data) {
      const raw = pdSold.data.raw_data || []

      // Map to the format property-comparables.tsx expects
      const sales = raw
        .filter((s) => s.price > 100) // filter out obvious anomalies (£700 leasehold transfers)
        .map((s) => ({
          price: s.price,
          date: s.date,
          street: s.address,
          propertyType: mapPropertyType(s.type || ""),
          tenure: s.tenure || "",
          bedrooms: s.bedrooms,
          distance: s.distance,
        }))

      const validPrices = sales.filter((s) => s.price > 1000).map((s) => s.price)
      const average = validPrices.length > 0
        ? Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length)
        : pdSold.data.average

      const valuationEstimate = await fetchValuationEstimate(postcode, bedrooms)

      console.log("[SOLD-ROUTE] PropertyData success -", sales.length, "sales, avg:", average)

      return NextResponse.json({
        success: true,
        source: "propertydata",
        data: {
          sales,
          average,
          count: sales.length,
          radiusMiles: parseFloat(pdSold.data.radius) * 0.621, // km to miles approx
          dateRange: {
            earliest: pdSold.data.date_earliest,
            latest: pdSold.data.date_latest,
          },
          confidenceRange: {
            "70pc": pdSold.data["70pc_range"],
            "90pc": pdSold.data["90pc_range"],
          },
        },
        valuationEstimate,
      })
    }

    console.log("[SOLD-ROUTE] PropertyData failed, falling back to Flask")

    // ── Fallback 2: Flask backend ──────────────────────────────────────
    const response = await fetch(`${FLASK_URL}/api/sold-prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postcode: postcode.toUpperCase(),
        ...(propertyTypeDetail ? { propertyTypeDetail } : {}),
        ...(propertyType ? { propertyType } : {}),
        ...(tenureType ? { tenureType } : {}),
        ...(bedrooms ? { bedrooms } : {}),
      }),
    })

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[SOLD-ROUTE] Error:", error)
    return NextResponse.json(
      { success: false, message: "Failed to fetch sold prices" },
      { status: 500 }
    )
  }
}
