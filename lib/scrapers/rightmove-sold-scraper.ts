/**
 * Rightmove SOLD comparables scraper (Bright Data Scraping Browser).
 *
 * Follows the project's scraper pattern: a single exported async function
 * that returns clean, typed rows and FAILS GRACEFULLY — any error, missing
 * config, or empty result returns `[]` so the GDV/ARV flow falls back to
 * HM Land Registry comparables without a broken UI.
 *
 * Rightmove's house-prices pages are a React Router app that streams its
 * data model into `window.__reactRouterContext.streamController.enqueue("…")`
 * inline scripts using the same index-encoding as `__PAGE_MODEL` on listing
 * pages (numbers inside containers are pointers into a flat array; object
 * keys are `_<idx>` pointers to their key string). We re-parse those script
 * tags in-page and decode `loaderData → searchResults.properties`, which
 * carries address, type, beds, photo, deep link and the full transaction
 * history per property — no fragile CSS selectors.
 *
 * These rows feed the Development / BRRRR / Flip ARV evidence sections and,
 * unlike Land Registry, carry photos + a deep link to the sold record.
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

/** Raw shape lifted out of the page model in evaluate(). */
interface RawSoldProperty {
  address: string
  propertyType: string
  bedrooms: number | null
  imageUrl: string | null
  detailUrl: string
  displayPrice: string
  dateSold: string
  tenure: string
  newBuild: boolean
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

    // The data model is in the initial HTML — no need to wait for hydration.
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 })

    const title = await page.title()
    console.log("[RM-Sold] page title:", title)

    const rawProps = await page.evaluate<RawSoldProperty[]>(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const out: RawSoldProperty[] = []

      // Decode Rightmove's index encoding (same family as __PAGE_MODEL):
      // the payload is a flat JSON array; numbers inside containers point at
      // other entries; object keys are "_<idx>" pointers to key strings;
      // negatives are sentinels (undefined/NaN/±Infinity) — mapped to null.
      const decodeIndexed = (arr: any[]): any => {
        const cache = new Map<number, any>()
        const decode = (i: any): any => {
          if (typeof i !== "number") return i
          if (i < 0) return null
          if (cache.has(i)) return cache.get(i)
          const node = arr[i]
          if (node === null || typeof node !== "object") {
            cache.set(i, node)
            return node
          }
          if (Array.isArray(node)) {
            const list: any[] = []
            cache.set(i, list)
            for (const el of node) list.push(decode(el))
            return list
          }
          const obj: Record<string, any> = {}
          cache.set(i, obj)
          for (const [k, v] of Object.entries(node)) {
            const key = /^_\d+$/.test(k) ? decode(parseInt(k.slice(1), 10)) : k
            obj[String(key)] = decode(v)
          }
          return obj
        }
        return decode(0)
      }

      try {
        // Pull the streamed chunk that carries the search results out of the
        // inline <script> tags (they persist in the DOM after execution).
        let payload: string | null = null
        const scripts = Array.from(
          document.querySelectorAll("script:not([src])"),
        )
        for (const s of scripts) {
          const text = s.textContent || ""
          if (!text.includes("streamController.enqueue")) continue
          const re = /streamController\.enqueue\("((?:[^"\\]|\\.)*)"\)/g
          let m: RegExpExecArray | null
          while ((m = re.exec(text))) {
            let chunk: string
            try {
              chunk = JSON.parse('"' + m[1] + '"')
            } catch {
              continue
            }
            if (chunk.includes('"searchResults"')) {
              payload = chunk
              break
            }
          }
          if (payload) break
        }
        if (!payload) return out

        const root = decodeIndexed(JSON.parse(payload.split("\n")[0]))
        const loaderData = root?.loaderData ?? {}
        const routeKey = Object.keys(loaderData).find((k) =>
          k.includes("house-prices"),
        )
        const properties: any[] =
          (routeKey && loaderData[routeKey]?.searchResults?.properties) || []

        for (const p of properties) {
          const tx = p?.latestTransaction ?? p?.transactions?.[0]
          if (!p?.address || !tx?.displayPrice) continue
          out.push({
            address: String(p.address),
            propertyType: String(p.propertyType ?? ""),
            bedrooms: typeof p.bedrooms === "number" ? p.bedrooms : null,
            imageUrl:
              p.imageInfo?.mediumImageUrl ??
              p.imageInfo?.imageUrl ??
              null,
            detailUrl: String(p.detailUrl ?? ""),
            displayPrice: String(tx.displayPrice),
            dateSold: String(tx.dateSold ?? ""),
            tenure: String(tx.tenure ?? ""),
            newBuild: Boolean(tx.newBuild),
          })
        }
      } catch {
        // Malformed model → empty; caller falls back to Land Registry.
      }
      return out
    })

    await browser.close()

    const parsed: RightmoveSoldListing[] = rawProps
      .map((l) => ({
        address: l.address,
        price: parsePrice(l.displayPrice),
        dateSold: l.dateSold,
        propertyType: prettyType(l.propertyType),
        bedrooms: l.bedrooms,
        floorSizeM2: null,
        floorSizeSqft: null,
        pricePerM2: null,
        pricePerSqft: null,
        tenure: l.tenure ? l.tenure.toLowerCase() : "unknown",
        isNewBuild: l.newBuild,
        images: l.imageUrl ? [l.imageUrl] : [],
        thumbnailUrl: l.imageUrl,
        listingUrl: l.detailUrl,
      }))
      .filter((l) => l.price > 0)
      // Bedrooms aren't a server-side filter on house-prices pages — apply
      // the band here, keeping unknown-bedroom rows (often still relevant).
      .filter(
        (l) =>
          l.bedrooms == null ||
          ((params.minBedrooms == null || l.bedrooms >= params.minBedrooms) &&
            (params.maxBedrooms == null || l.bedrooms <= params.maxBedrooms)),
      )

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

function prettyType(rmType: string): string {
  const map: Record<string, string> = {
    DETACHED: "Detached",
    SEMI_DETACHED: "Semi-detached",
    TERRACED: "Terraced",
    FLAT: "Flat",
    OTHER: "Other",
  }
  return map[rmType] ?? rmType.toLowerCase().replace(/_/g, " ")
}

/**
 * Map our form property types to Rightmove's house-prices filter values.
 * Unmappable types (bungalow, other, coarse "house") search all types —
 * a wrong filter is worse than none.
 */
function rmPropertyTypeFilter(type: string | undefined): string | null {
  switch ((type ?? "").toLowerCase()) {
    case "detached":
      return "DETACHED"
    case "semi-detached":
      return "SEMI_DETACHED"
    case "terraced":
    case "end-of-terrace":
      return "TERRACED"
    case "flat":
    case "flat-apartment":
    case "maisonette":
    case "apartment":
      return "FLAT"
    default:
      return null
  }
}

function buildSoldSearchUrl(district: string, params: ScrapeRightmoveSoldParams): string {
  const base = `https://www.rightmove.co.uk/house-prices/${district.toLowerCase()}.html`
  // The page filters by whole years: 1 / 2 / 3 / 5 / 10.
  const months = params.soldInMonths ?? 24
  const year = months <= 12 ? 1 : months <= 24 ? 2 : months <= 36 ? 3 : months <= 60 ? 5 : 10
  const query = new URLSearchParams({ year: String(year), area: "0" })
  const typeFilter = rmPropertyTypeFilter(params.propertyType)
  if (typeFilter) query.set("propertyType", typeFilter)
  return `${base}?${query.toString()}`
}
