import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { getSessionUser } from "@/lib/apiAuth"
import {
  scrapeRightmoveListing,
  type RightmoveListing,
} from "@/lib/scrapers/rightmove-listing-scraper"
import {
  scrapeZooplaListing,
  isZooplaListingUrl,
  type ZooplaListing,
} from "@/lib/scrapers/zoopla-listing-scraper"
import {
  listingToPropertyData,
  zooplaListingToPropertyData,
} from "@/lib/scrapers/listing-adapter"

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

/** Which portal a URL belongs to, or null when it isn't a listing we scrape. */
function portalFor(url: string): "rightmove" | "zoopla" | null {
  if (url.includes("rightmove.co.uk") && /properties\/\d+/.test(url)) return "rightmove"
  if (isZooplaListingUrl(url)) return "zoopla"
  return null
}

function cacheKeyForUrl(url: string, portal: "rightmove" | "zoopla"): string {
  // Stable, collision-safe key: listing id when present, else URL hash.
  const prefix = portal === "zoopla" ? "zp_listing" : "rm_listing"
  const idMatch = url.match(portal === "zoopla" ? /details\/(\d+)/ : /properties\/(\d+)/)
  if (idMatch) return `${prefix}_${idMatch[1]}`
  return `${prefix}_${createHash("sha256").update(url).digest("hex").slice(0, 32)}`
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
  // Session-gated: these scrapes spend Bright Data credits — never expose
  // them unauthenticated (the only caller, /analyse, requires login).
  const sessionUser = await getSessionUser()
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  let url: string
  try {
    const body = await request.json()
    url = String(body?.url ?? "")
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Must be a supported LISTING url (Rightmove /properties/<id> or Zoopla
  // /details/<id>) — a bare domain or search page can't be scraped as a
  // listing and shouldn't burn a browser session finding that out.
  const portal = portalFor(url)
  if (!portal) {
    return NextResponse.json(
      { error: "Invalid listing URL — expected a Rightmove or Zoopla property page" },
      { status: 400 },
    )
  }

  const cacheKey = cacheKeyForUrl(url, portal)
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
        console.log(`[Listing API] cache hit (${Math.round(age / 60000)}min old)`, { cacheKey, portal })
        const listing = cached.data as RightmoveListing | ZooplaListing
        return NextResponse.json({
          success: true,
          fromCache: true,
          listing,
          propertyData:
            portal === "zoopla"
              ? zooplaListingToPropertyData(listing as ZooplaListing)
              : listingToPropertyData(listing as RightmoveListing),
        })
      }
    }
  }

  // ── Fresh scrape ──────────────────────────────────────────────────────
  const listing =
    portal === "zoopla"
      ? await scrapeZooplaListing(url)
      : await scrapeRightmoveListing(url)

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
        source: portal,
        created_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" },
    )
    if (cacheErr) {
      console.warn("[Listing API] cache write failed:", cacheErr.message)
    }
  }

  return NextResponse.json({
    success: true,
    fromCache: false,
    listing,
    propertyData:
      portal === "zoopla"
        ? zooplaListingToPropertyData(listing as ZooplaListing)
        : listingToPropertyData(listing as RightmoveListing),
  })
}
