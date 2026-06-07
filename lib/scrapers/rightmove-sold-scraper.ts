/**
 * Rightmove SOLD comparables scraper (Bright Data Scraping Browser).
 *
 * Follows the project's scraper pattern: a single exported async function
 * that returns clean, typed rows and FAILS GRACEFULLY — any error, missing
 * config, or empty result returns `[]` so the GDV/ARV flow falls back to
 * HM Land Registry comparables without a broken UI.
 *
 * These rows feed the Development / BRRRR / Flip ARV evidence sections and,
 * unlike Land Registry, can carry photos + a deep link to the listing.
 */
import { BrightDataClient } from "./brightdata-client"

export interface RightmoveSoldListing {
  address: string
  price: number
  dateSold: string
  propertyType: string
  bedrooms?: number | null
  floorSizeM2?: number | null
  floorSizeSqft?: number | null
  pricePerM2?: number | null
  pricePerSqft?: number | null
  tenure: string
  isNewBuild: boolean
  images: string[]
  thumbnailUrl: string | null
  listingUrl: string
  description?: string
  distanceKm?: number
  daysOnMarket?: number
}

interface RawCard {
  address: string
  priceText: string
  dateSold: string
  propertyType: string
  bedsText: string
  thumbnailUrl: string | null
  listingPath: string | null
}

export interface ScrapeRightmoveSoldParams {
  postcode: string
  propertyType?: string
  minBedrooms?: number
  maxBedrooms?: number
  maxResults?: number
  soldInMonths?: number
}

export async function scrapeRightmoveSold(
  params: ScrapeRightmoveSoldParams,
): Promise<RightmoveSoldListing[]> {
  const district = params.postcode.split(" ")[0].toUpperCase()
  const searchUrl = buildSoldSearchUrl(district, params)

  console.log("[RM-Sold] scrape", { district, searchUrl, params })

  const browser = await BrightDataClient.connect()
  if (!browser) {
    // Not configured / unavailable → graceful no-op.
    return []
  }

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })

    await page.goto(searchUrl, { waitUntil: "networkidle0", timeout: 30000 })

    // Wait for any of the (frequently-changing) result containers.
    await page
      .waitForSelector(
        '.sold-prices-res, [data-test="house-prices-result"], .propertyCard',
        { timeout: 15000 },
      )
      .catch(() => null)

    const title = await page.title()
    console.log("[RM-Sold] page title:", title)

    const cards = await page.evaluate<RawCard[]>(() => {
      const results: RawCard[] = []
      // Try multiple selectors — Rightmove rotates their markup.
      const nodes = document.querySelectorAll(
        ".soldPropertiesDescription, " +
          '[data-test="house-prices-result"], ' +
          ".propertyCard--sold, " +
          ".sold-house-prices__list-item",
      )
      nodes.forEach((card) => {
        try {
          const price = card
            .querySelector('.price, [data-test="price"], .propertyCard-priceValue')
            ?.textContent?.trim()
          const address = card
            .querySelector('.address, [data-test="address"], .propertyCard-address')
            ?.textContent?.trim()
          const date = card
            .querySelector('.dateSold, [data-test="sold-date"], .propertyCard-details')
            ?.textContent?.trim()
          const type = card
            .querySelector('.propertyType, [data-test="type"]')
            ?.textContent?.trim()
          const beds = card
            .querySelector('.beds, [data-test="beds"], .propertyCard-details--type')
            ?.textContent?.trim()
          const img = card
            .querySelector(
              'img.propertyCard-img, .propertyCard-img img, [data-test="img"] img',
            )
            ?.getAttribute("src")
          const link = card
            .querySelector(
              'a[href*="/house-prices/"], a[href*="/property-for-sale/"]',
            )
            ?.getAttribute("href")

          if (price && address) {
            results.push({
              address,
              priceText: price,
              dateSold: date ?? "",
              propertyType: type ?? "",
              bedsText: beds ?? "",
              thumbnailUrl: img ?? null,
              listingPath: link ?? null,
            })
          }
        } catch {
          // Skip malformed cards.
        }
      })
      return results
    })

    await browser.close()

    const parsed: RightmoveSoldListing[] = cards
      .map((l) => {
        const price = parsePrice(l.priceText)
        return {
          address: l.address,
          price,
          dateSold: parseSoldDate(l.dateSold),
          propertyType: l.propertyType,
          bedrooms: parseBedrooms(l.bedsText),
          floorSizeM2: null,
          floorSizeSqft: null,
          pricePerM2: null,
          pricePerSqft: null,
          tenure: "unknown",
          isNewBuild: l.propertyType?.toLowerCase().includes("new") ?? false,
          images: l.thumbnailUrl ? [l.thumbnailUrl] : [],
          thumbnailUrl: l.thumbnailUrl,
          listingUrl: l.listingPath
            ? `https://www.rightmove.co.uk${l.listingPath}`
            : "",
        }
      })
      .filter((l) => l.price > 0)

    console.log("[RM-Sold] results:", { found: parsed.length, sample: parsed[0] })
    return parsed.slice(0, params.maxResults ?? 10)
  } catch (err) {
    console.error(
      "[RM-Sold] scrape error:",
      err instanceof Error ? err.message : String(err),
    )
    try {
      await browser.close()
    } catch {
      /* ignore */
    }
    return []
  }
}

// ── Parse helpers ─────────────────────────────────────────────────────────

function parsePrice(text: string): number {
  if (!text) return 0
  return parseInt(text.replace(/[^0-9]/g, ""), 10) || 0
}

function parseSoldDate(text: string): string {
  if (!text) return ""
  // "14 Jan 2024" or "2024-01-14"
  const match = text.match(/\d{1,2}\s+\w+\s+\d{4}|\d{4}-\d{2}-\d{2}/)
  return match?.[0] ?? text
}

function parseBedrooms(text: string): number | null {
  if (!text) return null
  const match = text.match(/(\d+)\s*bed/i)
  return match ? parseInt(match[1], 10) : null
}

function buildSoldSearchUrl(district: string, params: ScrapeRightmoveSoldParams): string {
  const base = `https://www.rightmove.co.uk/house-prices/${district.toLowerCase()}.html`
  const query = new URLSearchParams({
    soldIn: String(params.soldInMonths ?? 24),
    ...(params.propertyType ? { propertyTypes: params.propertyType } : {}),
    ...(params.minBedrooms ? { minBedrooms: String(params.minBedrooms) } : {}),
    ...(params.maxBedrooms ? { maxBedrooms: String(params.maxBedrooms) } : {}),
  })
  return `${base}?${query.toString()}`
}
