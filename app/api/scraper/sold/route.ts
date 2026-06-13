/**
 * POST /api/scraper/sold — Rightmove SOLD comparables for GDV/ARV evidence.
 *
 * Body:  { postcode, propertyType?, bedrooms?, soldInMonths? }
 * Reply: { listings, count, avgPrice, avgPricePerM2, source: 'rightmove_sold' }
 *
 * Sold data changes slowly, so results are cached 7 days (keyed by
 * district + type + beds) to avoid hammering the scraper. The scraper itself
 * fails gracefully (returns []) when Bright Data isn't configured, so this
 * endpoint always responds 200 with whatever it has — the caller then still
 * shows Land Registry comparables.
 */
import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/apiAuth"
import {
  scrapeRightmoveSold,
  type RightmoveSoldListing,
} from "@/lib/scrapers/rightmove-sold-scraper"

interface SoldResponse {
  listings: RightmoveSoldListing[]
  count: number
  avgPrice: number
  avgPricePerM2: number | null
  source: "rightmove_sold"
}

// 7-day in-memory cache (per server instance). Keeps repeat analyses of the
// same area from re-scraping; survives warm instances on Render.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const cache = new Map<string, { at: number; data: SoldResponse }>()

function cacheKey(district: string, type: string, beds: number | undefined): string {
  return `rm_sold_${district}_${type || "any"}_${beds ?? "any"}`
}

function summarise(listings: RightmoveSoldListing[]): SoldResponse {
  const prices = listings.map((l) => l.price).filter((p) => p > 0)
  const avgPrice = prices.length
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    : 0
  const ppm2 = listings
    .map((l) => (l.floorSizeM2 && l.price ? l.price / l.floorSizeM2 : null))
    .filter((v): v is number => v != null)
  const avgPricePerM2 = ppm2.length
    ? Math.round(ppm2.reduce((a, b) => a + b, 0) / ppm2.length)
    : null
  return { listings, count: listings.length, avgPrice, avgPricePerM2, source: "rightmove_sold" }
}

export async function POST(req: Request) {
  const sessionUser = await getSessionUser()
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }
  let body: {
    postcode?: string
    propertyType?: string
    bedrooms?: number
    soldInMonths?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const postcode = (body.postcode ?? "").trim()
  if (!postcode) {
    return NextResponse.json({ error: "postcode is required" }, { status: 400 })
  }

  const district = postcode.split(" ")[0].toUpperCase()
  const key = cacheKey(district, body.propertyType ?? "", body.bedrooms)

  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ ...hit.data, cached: true })
  }

  try {
    const listings = await scrapeRightmoveSold({
      postcode,
      propertyType: body.propertyType,
      // Widen the bed band ±1 so we still get comps for the unit size.
      minBedrooms: body.bedrooms ? Math.max(0, body.bedrooms - 1) : undefined,
      maxBedrooms: body.bedrooms ? body.bedrooms + 1 : undefined,
      soldInMonths: body.soldInMonths ?? 18,
      maxResults: 10,
    })

    const data = summarise(listings)
    // Only cache non-empty results so a transient empty scrape doesn't pin a
    // 7-day blank (the caller still gets Land Registry meanwhile).
    if (data.count > 0) cache.set(key, { at: Date.now(), data })
    return NextResponse.json(data)
  } catch (err) {
    console.error("[/api/scraper/sold] error:", err)
    // Graceful: empty payload, 200, so the UI keeps Land Registry comps.
    return NextResponse.json(summarise([]))
  }
}
