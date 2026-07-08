import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  scrapeRightmoveListing,
  type RightmoveListing,
} from "@/lib/scrapers/rightmove-listing-scraper"
import { listingToPropertyData } from "@/lib/scrapers/listing-adapter"

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

  // Must be a Rightmove listing URL (/properties/<id>) — a bare domain or
  // search page can't be scraped as a listing and shouldn't burn a browser
  // session finding that out.
  if (!url.includes("rightmove.co.uk") || !/properties\/\d+/.test(url)) {
    return NextResponse.json(
      { error: "Invalid Rightmove listing URL" },
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

  // Only cache results with real substance — a partial extraction (e.g.
  // address-only after a blocked page) would otherwise poison 4 hours of
  // requests for this listing.
  if (supabase && listing.price > 0) {
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
