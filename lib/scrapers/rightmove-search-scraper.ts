/**
 * Rightmove SEARCH-RESULTS scraper (Bright Data Scraping Browser).
 *
 * Scrapes for-sale search pages (property-for-sale/find.html) into typed
 * rows — companion to rightmove-listing-scraper.ts and the existing
 * rightmove-sold-scraper.ts. Same pattern: single exported function,
 * graceful [] on any failure.
 *
 * Like the listing scraper, prefers Rightmove's embedded hydration JSON
 * (window.jsonModel on search pages) over DOM selectors — jsonModel.properties
 * carries id, price, address, beds/baths, summary and images per card.
 */

import {
  connectBrightData,
  closeBrightData,
  newBrightDataContext,
} from "./brightdata-browser"

export interface RightmoveSearchResult {
  listingId: string
  listingUrl: string
  address: string
  postcode: string
  price: number
  priceText: string
  bedrooms: number | null
  bathrooms: number | null
  propertyType: string | null
  tenure: string | null
  thumbnailUrl: string | null
  description: string | null
  addedDate: string | null
  isReduced: boolean
  reducedPct: number | null
  distanceKm: number | null
  source: "brightdata_rightmove"
}

export interface SearchParams {
  /** Rightmove location token, e.g. "OUTCODE^518" or "REGION^904". */
  locationIdentifier?: string
  /** Fallback when no locationIdentifier — outcode is derived from this. */
  postcode?: string
  maxPrice?: number
  minPrice?: number
  minBedrooms?: number
  maxBedrooms?: number
  propertyTypes?: string[]
  /** Search radius in miles. */
  radius?: number
  sortType?: "newest" | "price_asc" | "price_desc"
  maxResults?: number
}

interface RawSearchCard {
  listingId: string
  listingPath: string
  priceText: string
  address: string
  bedsText: string
  bathsText: string
  propType: string
  tenureType: string
  thumbnailUrl: string | null
  description: string | null
  addedDate: string | null
  isReduced: boolean
}

/**
 * Rightmove location identifiers are internal numeric ids (OUTCODE^1550 =
 * LS6) — passing the outcode string 404s. Resolve via their typeahead API.
 */
export async function resolveOutcodeIdentifier(
  postcode: string,
): Promise<string | null> {
  const outcode = postcode.trim().split(/\s+/)[0].toUpperCase()
  if (!outcode) return null
  try {
    const res = await fetch(
      `https://los.rightmove.co.uk/typeahead?query=${encodeURIComponent(outcode)}&limit=10`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      },
    )
    if (!res.ok) {
      console.warn(`[RM-Search] typeahead HTTP ${res.status} for ${outcode}`)
      return null
    }
    const data = (await res.json()) as {
      matches?: Array<{ id: string; type: string; displayName: string }>
    }
    const match = (data.matches ?? []).find(
      (m) => m.type === "OUTCODE" && m.displayName?.toUpperCase() === outcode,
    )
    if (!match) {
      console.warn(`[RM-Search] no OUTCODE match for ${outcode}`)
      return null
    }
    return `OUTCODE^${match.id}`
  } catch (err) {
    console.warn(
      "[RM-Search] typeahead error:",
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}

export async function scrapeRightmoveSearch(
  params: SearchParams,
): Promise<RightmoveSearchResult[]> {
  let locationIdentifier = params.locationIdentifier ?? null
  if (!locationIdentifier && params.postcode) {
    locationIdentifier = await resolveOutcodeIdentifier(params.postcode)
  }
  if (!locationIdentifier) {
    console.warn("[RM-Search] no resolvable location — cannot build URL")
    return []
  }

  const searchUrl = buildRightmoveSearchUrl({ ...params, locationIdentifier })
  if (!searchUrl) return []

  console.log("[RM-Search] scrape", { searchUrl, params })

  const browser = await connectBrightData()
  if (!browser) return []

  try {
    const context = await newBrightDataContext(browser)
    const page = await context.newPage()
    page.setDefaultTimeout(30000)

    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 })

    await page
      .waitForSelector(
        'div[data-testid="propertyCard"], .propertyCard, [class*="PropertyCard"]',
        { timeout: 15000 },
      )
      .catch(() => {
        console.warn("[RM-Search] no property cards matched the standard selectors")
      })

    const maxResults = params.maxResults ?? 20

    const cards = await page.evaluate((limit: number): RawSearchCard[] => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const rows: RawSearchCard[] = []

      // ── 1. Hydration JSON — Next.js __NEXT_DATA__ (current) or the
      //       legacy window.jsonModel ──────────────────────────────────
      let properties: any[] | undefined
      try {
        const nextData = document.getElementById("__NEXT_DATA__")?.textContent
        if (nextData) {
          const parsed = JSON.parse(nextData)
          properties = parsed?.props?.pageProps?.searchResults?.properties
        }
      } catch {
        /* fall through to jsonModel / DOM */
      }
      if (!Array.isArray(properties) || properties.length === 0) {
        properties = (window as any).jsonModel?.properties
      }

      if (Array.isArray(properties) && properties.length > 0) {
        for (const p of properties.slice(0, limit)) {
          rows.push({
            listingId: String(p.id ?? ""),
            listingPath: String(p.propertyUrl ?? `/properties/${p.id}`),
            priceText: String(
              p.price?.displayPrices?.[0]?.displayPrice ?? p.price?.amount ?? "",
            ),
            address: String(p.displayAddress ?? ""),
            bedsText: String(p.bedrooms ?? ""),
            bathsText: String(p.bathrooms ?? ""),
            propType: String(p.propertySubType ?? p.propertyTypeFullDescription ?? ""),
            tenureType: String(p.tenure?.tenureType ?? ""),
            thumbnailUrl: p.propertyImages?.mainImageSrc
              ? String(p.propertyImages.mainImageSrc)
              : null,
            description: p.summary ? String(p.summary) : null,
            addedDate: String(p.firstVisibleDate ?? p.listingUpdate?.listingUpdateDate ?? "") || null,
            isReduced:
              /reduced/i.test(String(p.addedOrReduced ?? "")) ||
              /price_reduced|reduced/i.test(String(p.listingUpdate?.listingUpdateReason ?? "")),
          })
        }
        return rows
      }

      // ── 2. DOM fallback — property cards ───────────────────────────
      const cardEls = document.querySelectorAll(
        'div[data-testid="propertyCard"], .propertyCard, [class*="PropertyCard"]',
      )
      cardEls.forEach((card, index) => {
        if (index >= limit) return
        try {
          const href =
            card.querySelector('a[href*="/properties/"]')?.getAttribute("href") ?? ""
          const idMatch = href.match(/properties\/(\d+)/)
          if (!idMatch) return

          const text = (sel: string) =>
            card.querySelector(sel)?.textContent?.trim() ?? ""

          rows.push({
            listingId: idMatch[1],
            listingPath: href,
            priceText: text('[data-testid="price"], [class*="price"]'),
            address: text('address, [data-testid="address"], [class*="address"]'),
            bedsText: text('[data-testid="beds"], span[class*="bed"]'),
            bathsText: text('[data-testid="baths"], span[class*="bath"]'),
            propType: text(
              '[data-testid="property-type"], [class*="propertyType"], [class*="property-information"]',
            ),
            tenureType: "",
            thumbnailUrl:
              card.querySelector("img")?.getAttribute("src") ?? null,
            description: text('[class*="summary"], [class*="description"]') || null,
            addedDate: text('[class*="addedOrReduced"], [class*="added"]') || null,
            isReduced: /reduced/i.test(card.textContent ?? ""),
          })
        } catch {
          // Skip malformed cards.
        }
      })
      return rows
    }, maxResults)

    await closeBrightData(browser)

    const results = cards
      .filter((c) => c.listingId)
      .map((c) => normaliseSearchCard(c))
      .filter((c) => c.price > 0)

    console.log("[RM-Search] results:", {
      found: results.length,
      sample: results[0]?.address,
    })
    return results
  } catch (err) {
    console.error(
      "[RM-Search] scrape error:",
      err instanceof Error ? err.message : String(err),
    )
    await closeBrightData(browser)
    return []
  }
}

function normaliseSearchCard(c: RawSearchCard): RightmoveSearchResult {
  const price = parseInt(c.priceText.replace(/[^0-9]/g, ""), 10) || 0
  const bedsMatch = c.bedsText.match(/(\d+)/)
  const bathsMatch = c.bathsText.match(/(\d+)/)
  const postcodeMatch = c.address.match(
    /([A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2})/i,
  )

  return {
    listingId: c.listingId,
    listingUrl: c.listingPath.startsWith("http")
      ? c.listingPath
      : `https://www.rightmove.co.uk${c.listingPath}`,
    address: c.address,
    postcode: postcodeMatch?.[1]?.toUpperCase() ?? "",
    price,
    priceText: c.priceText,
    bedrooms: bedsMatch ? parseInt(bedsMatch[1], 10) : null,
    bathrooms: bathsMatch ? parseInt(bathsMatch[1], 10) : null,
    propertyType: c.propType || null,
    tenure: c.tenureType ? c.tenureType.toLowerCase() : null
    thumbnailUrl: c.thumbnailUrl,
    description: c.description,
    addedDate: c.addedDate,
    isReduced: c.isReduced,
    reducedPct: null,
    distanceKm: null,
    source: "brightdata_rightmove",
  }
}

export function buildRightmoveSearchUrl(params: SearchParams): string | null {
  const base = "https://www.rightmove.co.uk/property-for-sale/find.html"
  const q = new URLSearchParams()

  // Callers resolve postcodes to a numeric identifier first (see
  // resolveOutcodeIdentifier) — the raw outcode string is NOT accepted here.
  if (params.locationIdentifier) {
    q.set("locationIdentifier", params.locationIdentifier)
  } else {
    return null
  }

  if (params.maxPrice) q.set("maxPrice", String(params.maxPrice))
  if (params.minPrice) q.set("minPrice", String(params.minPrice))
  if (params.minBedrooms) q.set("minBedrooms", String(params.minBedrooms))
  if (params.maxBedrooms) q.set("maxBedrooms", String(params.maxBedrooms))
  if (params.radius) q.set("radius", String(params.radius))
  if (params.propertyTypes?.length)
    q.set("propertyTypes", params.propertyTypes.join(","))

  const SORT_MAP: Record<string, string> = {
    newest: "6",
    price_asc: "1",
    price_desc: "2",
  }
  if (params.sortType) q.set("sortType", SORT_MAP[params.sortType] ?? "6")

  q.set("index", "0")
  return `${base}?${q.toString()}`
}
