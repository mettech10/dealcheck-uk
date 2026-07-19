import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { getSessionUser } from "@/lib/apiAuth"
import {
  scrapeRightmoveSearch,
  type RightmoveSearchResult,
  type SearchParams,
} from "@/lib/scrapers/rightmove-search-scraper"

/**
 * POST /api/scraper/search — Bright Data Rightmove search-results scrape.
 *
 * Body: SearchParams (locationIdentifier or postcode, plus optional price/
 * bedroom/radius/sort filters). Returns { listings, count, source }.
 *
 * Successful scrapes cache in `scraper_cache` for 1 hour — search pages
 * churn faster than individual listings, but repeated comparable lookups
 * for the same outcode within a session shouldn't re-bill Bright Data.
 */

export const maxDuration = 300
export const runtime = "nodejs"

const CACHE_TTL_MS = 60 * 60 * 1000

function cacheKeyForParams(params: SearchParams): string {
  const stable = JSON.stringify({
    c: params.channel ?? "buy",
    l: params.locationIdentifier ?? params.postcode?.split(" ")[0]?.toUpperCase(),
    xp: params.maxPrice,
    np: params.minPrice,
    nb: params.minBedrooms,
    xb: params.maxBedrooms,
    pt: params.propertyTypes,
    r: params.radius,
    s: params.sortType,
    m: params.maxResults,
  })
  return `rm_search_${createHash("sha256").update(stable).digest("hex").slice(0, 32)}`
}

function tryAdminClient() {
  try {
    return createAdminClient()
  } catch {
    console.warn("[RM-Search API] Supabase admin env missing — cache disabled")
    return null
  }
}

export async function POST(request: Request) {
  // Session-gated: these scrapes spend Bright Data credits — never expose
  // them unauthenticated (the only caller, /analyse, requires login).
  const sessionUser = await getSessionUser()
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  let params: SearchParams
  try {
    params = (await request.json()) as SearchParams
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!params.locationIdentifier && !params.postcode) {
    return NextResponse.json(
      { error: "locationIdentifier or postcode is required" },
      { status: 400 },
    )
  }

  const cacheKey = cacheKeyForParams(params)
  const supabase = tryAdminClient()

  if (supabase) {
    const { data: cached } = await supabase
      .from("scraper_cache")
      .select("data, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle()

    if (cached?.data) {
      const age = Date.now() - new Date(cached.created_at).getTime()
      if (age < CACHE_TTL_MS) {
        const listings = cached.data as RightmoveSearchResult[]
        console.log(`[RM-Search API] cache hit (${Math.round(age / 60000)}min old)`, { cacheKey })
        return NextResponse.json({
          listings,
          count: listings.length,
          source: "brightdata_rightmove",
          fromCache: true,
        })
      }
    }
  }

  const listings = await scrapeRightmoveSearch(params)

  // Cache only non-empty result sets — an empty scrape is more likely a
  // transient block than a genuinely empty market, so let the next call retry.
  if (supabase && listings.length > 0) {
    const { error: cacheErr } = await supabase.from("scraper_cache").upsert(
      {
        cache_key: cacheKey,
        data: listings,
        source: "rightmove",
        created_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" },
    )
    if (cacheErr) {
      console.warn("[RM-Search API] cache write failed:", cacheErr.message)
    }
  }

  return NextResponse.json({
    listings,
    count: listings.length,
    source: "brightdata_rightmove",
    fromCache: false,
  })
}
