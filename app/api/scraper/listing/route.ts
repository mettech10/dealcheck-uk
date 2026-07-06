import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  scrapeRightmoveListing,
  type RightmoveListing,
} from "@/lib/scrapers/rightmove-listing-scraper"

/**
 * POST /api/scraper/listing — Bright Data Rightmove listing scrape.
 *
 * Replaces the Apify path (Next /api/analyse scrape-only → Flask
 * /extract-url → Apify actor) while Apify is unavailable. Returns BOTH:
 *   - `propertyData` in the exact camelCase shape /api/analyse produced,
 *     so page.tsx's pre-fill mapping and PropertyListingCard stay untouched
 *   - `listing`, the raw RightmoveListing for callers that want everything
 *
 * Successful scrapes are cached in Supabase `scraper_cache` for 4 hours
 * (listings rarely change intra-day) to keep Bright Data usage down.
 */

// Scraping Browser sessions can take 30-60s; match /api/analyse's ceiling.
export const maxDuration = 300
export const runtime = "nodejs"

const CACHE_TTL_MS = 4 * 60 * 60 * 1000

function cacheKeyForUrl(url: string): string {
  // Stable, collision-safe key: listing id when present, else URL hash.
  const idMatch = url.match(/properties\/(\d+)/)
  if (idMatch) return `rm_listing_${idMatch[1]}`
  return `rm_listing_${createHash("sha256").update(url).digest("hex").slice(0, 32)}`
}

/** Service-role client, or null when env is missing — cache becomes a no-op. */
function tryAdminClient() {
  try {
    return createAdminClient()
  } catch {
    console.warn("[RM-Listing API] Supabase admin env missing — cache disabled")
    return null
  }
}

export async function POST(request: Request) {
  let url: string
  try {
    const body = await request.json()
    url = String(body?.url ?? "")
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!url || !url.includes("rightmove.co.uk")) {
    return NextResponse.json(
      { error: "Invalid Rightmove URL" },
      { status: 400 },
    )
  }

  const cacheKey = cacheKeyForUrl(url)
  const supabase = tryAdminClient()

  // ── Cache lookup ──────────────────────────────────────────────────────
  if (supabase) {
    const { data: cached } = await supabase
      .from("scraper_cache")
      .select("data, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle()

    if (cached?.data) {
      const age = Date.now() - new Date(cached.created_at).getTime()
      if (age < CACHE_TTL_MS) {
        console.log(`[RM-Listing API] cache hit (${Math.round(age / 60000)}min old)`, { cacheKey })
        const listing = cached.data as RightmoveListing
        return NextResponse.json({
          success: true,
          fromCache: true,
          listing,
          propertyData: listingToPropertyData(listing),
        })
      }
    }
  }

  // ── Fresh scrape ──────────────────────────────────────────────────────
  const listing = await scrapeRightmoveListing(url)

  if (!listing) {
    return NextResponse.json(
      { error: "Failed to scrape listing" },
      { status: 500 },
    )
  }

  if (supabase) {
    const { error: cacheErr } = await supabase.from("scraper_cache").upsert(
      {
        cache_key: cacheKey,
        data: listing,
        source: "rightmove",
        created_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" },
    )
    if (cacheErr) {
      console.warn("[RM-Listing API] cache write failed:", cacheErr.message)
    }
  }

  return NextResponse.json({
    success: true,
    fromCache: false,
    listing,
    propertyData: listingToPropertyData(listing),
  })
}

// ── Adapter: RightmoveListing → the propertyData shape /api/analyse returns ─

/** Same detail buckets the Flask/analyse pipeline mapped to form enums. */
const DETAIL_MAP: Record<string, string> = {
  "end-terrace": "end-of-terrace",
  terraced: "terraced",
  "semi-detached": "semi-detached",
  detached: "detached",
  flat: "flat-apartment",
  maisonette: "maisonette",
  bungalow: "bungalow",
}

/** RICS/NHBC size averages — same heuristic table /api/analyse uses. */
const SQFT_ESTIMATES: Record<
  number,
  { flat: number; semi: number; detached: number; house: number }
> = {
  0: { flat: 270, semi: 350, detached: 400, house: 350 },
  1: { flat: 495, semi: 560, detached: 700, house: 560 },
  2: { flat: 624, semi: 775, detached: 950, house: 775 },
  3: { flat: 800, semi: 1001, detached: 1200, house: 947 },
  4: { flat: 1050, semi: 1200, detached: 1500, house: 1300 },
  5: { flat: 1300, semi: 1500, detached: 1900, house: 1700 },
  6: { flat: 1500, semi: 1700, detached: 2200, house: 2000 },
}

function listingToPropertyData(listing: RightmoveListing) {
  const detail = listing.propertyType
    ? DETAIL_MAP[listing.propertyType]
    : undefined
  const broadType = ["flat-apartment", "maisonette"].includes(detail ?? "")
    ? "flat"
    : "house"

  // Floor size: scraped value wins; otherwise estimate from bedrooms so the
  // analysis isn't blocked (sqftSource labels it for the user to verify).
  let sqft = listing.floorSizeSqft ?? undefined
  let sqftSource: string | undefined = sqft ? "listing" : undefined
  if (!sqft && listing.bedrooms && listing.bedrooms > 0) {
    const row =
      SQFT_ESTIMATES[Math.min(Math.max(listing.bedrooms, 0), 6)] ??
      SQFT_ESTIMATES[3]
    const t = listing.propertyType ?? ""
    sqft =
      t === "flat" || t === "maisonette"
        ? row.flat
        : t === "detached"
        ? row.detached
        : t === "semi-detached"
        ? row.semi
        : row.house
    sqftSource = "estimated"
  }

  return {
    address: listing.address || "",
    postcode: listing.postcode || "",
    purchasePrice: listing.price || 0,
    propertyType: broadType,
    ...(detail ? { propertyTypeDetail: detail } : {}),
    bedrooms: listing.bedrooms ?? undefined,
    ...(listing.bathrooms ? { bathrooms: listing.bathrooms } : {}),
    ...(sqft ? { sqft } : {}),
    ...(listing.floorSizeM2 ? { sqm: listing.floorSizeM2 } : {}),
    ...(sqftSource ? { sqftSource } : {}),
    ...(listing.tenure === "freehold" || listing.tenure === "leasehold"
      ? { tenureType: listing.tenure }
      : {}),
    ...(listing.tenure === "leasehold" && listing.leaseYearsRemaining
      ? { leaseYears: listing.leaseYearsRemaining }
      : {}),
    description: listing.description ?? undefined,
    keyFeatures: listing.keyFeatures.length ? listing.keyFeatures : undefined,
    images: listing.images.length ? listing.images : undefined,
    floorplans: listing.floorplans.length ? listing.floorplans : undefined,
    agentName: listing.agent ?? undefined,
    agentPhone: listing.agentPhone ?? undefined,
    agentAddress: listing.agentAddress ?? undefined,
    listingUrl: listing.listingUrl,
    // "rightmove" (not brightdata_rightmove) — PropertyListingCard and the
    // strategy detection in page.tsx key off this exact value.
    source: "rightmove",
    councilTaxBand: listing.councilTaxBand ?? undefined,
  }
}
