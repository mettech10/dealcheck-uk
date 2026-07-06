/**
 * Rightmove LISTING scraper (Bright Data Scraping Browser).
 *
 * Backup for the Apify `dhrumil/rightmove-scraper` actor while Apify is
 * unavailable. Follows the project's scraper pattern (see
 * rightmove-sold-scraper.ts / the backend SpareRoom scraper): one exported
 * async function, typed result, FAILS GRACEFULLY — any error returns null so
 * the caller can fall back (Flask /extract-url still runs Firecrawl + the
 * basic scraper).
 *
 * Extraction strategy, most→least reliable:
 *   1. `window.PAGE_MODEL.propertyData` — Rightmove hydrates the listing page
 *      from this embedded JSON blob; it carries every field we need and is
 *      the same source the Apify actor read.
 *   2. DOM selectors — best-effort fallback if PAGE_MODEL is missing or
 *      Rightmove reshapes it.
 */

import {
  connectBrightData,
  closeBrightData,
  newBrightDataContext,
} from "./brightdata-browser"

export interface RightmoveListing {
  // Core fields
  address: string
  postcode: string
  price: number
  priceText: string

  // Property details
  bedrooms: number | null
  bathrooms: number | null
  propertyType: string | null
  tenure: string | null
  leaseYearsRemaining: number | null

  // Size
  floorSizeSqft: number | null
  floorSizeM2: number | null

  // Media
  images: string[]
  floorplanUrl: string | null
  floorplans: string[]

  // Description
  description: string | null
  keyFeatures: string[]

  // EPC / Council Tax
  epcRating: string | null
  epcUrl: string | null
  councilTaxBand: string | null

  // Listing info
  listingId: string | null
  listingUrl: string
  agent: string | null
  agentPhone: string | null
  agentAddress: string | null
  addedDate: string | null
  reducedDate: string | null
  originalPrice: number | null

  // Status
  isReduced: boolean
  isSold: boolean
  isUnderOffer: boolean

  // Source metadata
  scrapedAt: string
  source: "brightdata_rightmove"
}

/** Raw payload assembled inside page.evaluate — parsed/normalised in Node. */
interface RawExtract {
  fromPageModel: boolean
  priceText: string
  displayPriceQualifier: string
  address: string
  outcode: string
  incode: string
  bedrooms: number | null
  bathrooms: number | null
  propertySubType: string
  tenureType: string
  leaseYears: number | null
  sizings: Array<{ unit: string; minimumSize?: number; maximumSize?: number }>
  images: string[]
  floorplans: string[]
  description: string
  keyFeatures: string[]
  epcUrl: string | null
  councilTaxBand: string
  agentName: string
  agentPhone: string
  agentAddress: string
  listingUpdateReason: string
  statusText: string
  pageTextSample: string
}

export async function scrapeRightmoveListing(
  url: string,
): Promise<RightmoveListing | null> {
  console.log("[RM-Listing] scrape", {
    url,
    timestamp: new Date().toISOString(),
  })

  const browser = await connectBrightData()
  if (!browser) return null

  try {
    const context = await newBrightDataContext(browser)
    const page = await context.newPage()
    page.setDefaultTimeout(30000)

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })

    // Property header (or the PAGE_MODEL script) signals the page is real
    // content and not an interstitial.
    await page
      .waitForSelector('h1, [data-testid="property-header"]', {
        timeout: 15000,
      })
      .catch(() => null)

    console.log("[RM-Listing] page loaded:", await page.title())

    const raw = await page.evaluate((): RawExtract => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const out: RawExtract = {
        fromPageModel: false,
        priceText: "",
        displayPriceQualifier: "",
        address: "",
        outcode: "",
        incode: "",
        bedrooms: null,
        bathrooms: null,
        propertySubType: "",
        tenureType: "",
        leaseYears: null,
        sizings: [],
        images: [],
        floorplans: [],
        description: "",
        keyFeatures: [],
        epcUrl: null,
        councilTaxBand: "",
        agentName: "",
        agentPhone: "",
        agentAddress: "",
        listingUpdateReason: "",
        statusText: "",
        pageTextSample: "",
      }

      const getText = (selector: string, fallback = "") => {
        const el = document.querySelector(selector)
        return el?.textContent?.trim() ?? fallback
      }

      // ── 1. PAGE_MODEL — Rightmove's embedded hydration JSON ─────────
      const model = (window as any).PAGE_MODEL
      const pd = model?.propertyData
      if (pd) {
        out.fromPageModel = true
        out.priceText = String(pd.prices?.primaryPrice ?? "")
        out.displayPriceQualifier = String(
          pd.prices?.displayPriceQualifier ?? "",
        )
        out.address = String(pd.address?.displayAddress ?? "")
        out.outcode = String(pd.address?.outcode ?? "")
        out.incode = String(pd.address?.incode ?? "")
        out.bedrooms =
          typeof pd.bedrooms === "number" ? pd.bedrooms : null
        out.bathrooms =
          typeof pd.bathrooms === "number" ? pd.bathrooms : null
        out.propertySubType = String(pd.propertySubType ?? "")
        out.tenureType = String(pd.tenure?.tenureType ?? "")
        out.leaseYears =
          typeof pd.tenure?.yearsRemainingOnLease === "number" &&
          pd.tenure.yearsRemainingOnLease > 0
            ? pd.tenure.yearsRemainingOnLease
            : null
        out.sizings = Array.isArray(pd.sizings)
          ? pd.sizings.map((s: any) => ({
              unit: String(s.unit ?? ""),
              minimumSize: Number(s.minimumSize) || undefined,
              maximumSize: Number(s.maximumSize) || undefined,
            }))
          : []
        out.images = Array.isArray(pd.images)
          ? pd.images
              .map((i: any) => String(i?.url ?? ""))
              .filter((u: string) => u.startsWith("http"))
          : []
        out.floorplans = Array.isArray(pd.floorplans)
          ? pd.floorplans
              .map((f: any) => String(f?.url ?? ""))
              .filter((u: string) => u.startsWith("http"))
          : []
        out.description = String(pd.text?.description ?? "")
        out.keyFeatures = Array.isArray(pd.keyFeatures)
          ? pd.keyFeatures.map((f: any) => String(f))
          : []
        out.epcUrl = pd.epcGraphs?.[0]?.url
          ? String(pd.epcGraphs[0].url)
          : null
        out.councilTaxBand = String(
          pd.livingCosts?.councilTaxBand ?? "",
        )
        out.agentName = String(
          pd.customer?.branchDisplayName ?? pd.customer?.companyName ?? "",
        )
        out.agentPhone = String(pd.contactInfo?.telephoneNumbers?.localNumber ?? "")
        out.agentAddress = String(pd.customer?.displayAddress ?? "")
        out.listingUpdateReason = String(
          pd.listingHistory?.listingUpdateReason ?? "",
        )
      }

      // ── 2. DOM fallbacks for anything PAGE_MODEL didn't give us ─────
      if (!out.priceText) {
        out.priceText = getText(
          '[data-testid="price-value"], .property-header-price, article[class*="price"] span',
        )
      }
      if (!out.address) {
        out.address = getText(
          'h1[class*="address"], [data-testid="address-label"], h1[itemprop="streetAddress"], h1',
        )
      }
      if (!out.description) {
        out.description = getText(
          '[data-testid="description"], .property-description, [class*="STw8udCxUaBUMfOOZu0iL"]',
        )
      }
      if (out.keyFeatures.length === 0) {
        out.keyFeatures = Array.from(
          document.querySelectorAll(
            'ul[class*="feature"] li, [data-testid="bullets"] li, .key-features li',
          ),
        )
          .map((el) => el.textContent?.trim() ?? "")
          .filter(Boolean)
      }
      if (out.images.length === 0) {
        out.images = Array.from(
          document.querySelectorAll(
            '[data-testid="gallery"] img, [class*="gallery"] img, img[class*="propertyImage"]',
          ),
        )
          .map((img) => img.getAttribute("src") ?? "")
          .filter(
            (s) => s.startsWith("http") && !s.includes("icon") && !s.includes("logo"),
          )
      }
      if (!out.agentName) {
        out.agentName = getText(
          '[data-testid="agent-name"], .agent-name, a[class*="agent"] h3',
        )
      }

      // Status detection (banner text, sold-STC markers)
      out.statusText = getText(
        '[data-testid="banner"], [class*="propertyStatus"], [class*="soldBanner"]',
      )
      out.pageTextSample = (document.body.textContent ?? "")
        .toLowerCase()
        .slice(0, 5000)

      return out
    })

    await closeBrightData(browser)

    if (!raw.address && !raw.priceText) {
      console.warn("[RM-Listing] no data extracted — page blocked or listing removed")
      return null
    }

    const result = normaliseListing(url, raw)
    console.log("[RM-Listing] result:", {
      fromPageModel: raw.fromPageModel,
      address: result.address,
      postcode: result.postcode,
      price: result.price,
      beds: result.bedrooms,
      type: result.propertyType,
      tenure: result.tenure,
      floorM2: result.floorSizeM2,
      images: result.images.length,
      features: result.keyFeatures.length,
    })
    return result
  } catch (err) {
    console.error(
      "[RM-Listing] scrape error:",
      err instanceof Error ? err.message : String(err),
      { url },
    )
    await closeBrightData(browser)
    return null
  }
}

// ── Normalisation (plain Node — keep page.evaluate dumb) ───────────────────

function normaliseListing(url: string, raw: RawExtract): RightmoveListing {
  const price = parseInt(raw.priceText.replace(/[^0-9]/g, ""), 10) || 0

  // Floor size — PAGE_MODEL sizings first, then key features, then description.
  let floorSizeSqft: number | null = null
  let floorSizeM2: number | null = null
  for (const s of raw.sizings) {
    const size = s.maximumSize ?? s.minimumSize
    if (!size) continue
    if (s.unit === "sqft" && !floorSizeSqft) floorSizeSqft = Math.round(size)
    if ((s.unit === "sqm" || s.unit === "m2") && !floorSizeM2)
      floorSizeM2 = Math.round(size * 10) / 10
  }
  if (!floorSizeSqft && !floorSizeM2) {
    const textPool = [raw.keyFeatures.join(" "), raw.description].join(" ")
    const sqftMatch = textPool.match(/([0-9][0-9,]*(?:\.\d+)?)\s*(?:sq\.?\s*ft|ft²|sqft|square\s*feet)\b/i)
    const m2Match = textPool.match(/([0-9][0-9,]*(?:\.\d+)?)\s*(?:sq\.?\s*m|m²|m2|sqm|square\s*met(?:re|er)s?)\b/i)
    if (sqftMatch) {
      const v = parseFloat(sqftMatch[1].replace(/,/g, ""))
      if (v >= 100 && v <= 20000) floorSizeSqft = Math.round(v)
    } else if (m2Match) {
      const v = parseFloat(m2Match[1].replace(/,/g, ""))
      if (v >= 10 && v <= 2000) floorSizeM2 = Math.round(v * 10) / 10
    }
  }
  if (floorSizeSqft && !floorSizeM2)
    floorSizeM2 = Math.round(floorSizeSqft * 0.0929 * 10) / 10
  if (floorSizeM2 && !floorSizeSqft)
    floorSizeSqft = Math.round(floorSizeM2 * 10.764)

  // Tenure
  const tenureLower = [
    raw.tenureType,
    raw.keyFeatures.join(" "),
  ]
    .join(" ")
    .toLowerCase()
  let tenure: string | null = null
  if (tenureLower.includes("freehold")) tenure = "freehold"
  else if (tenureLower.includes("leasehold")) tenure = "leasehold"
  else if (tenureLower.includes("share of freehold")) tenure = "share-of-freehold"

  let leaseYearsRemaining = raw.leaseYears
  if (tenure === "leasehold" && !leaseYearsRemaining) {
    const m =
      raw.keyFeatures.join(" ").match(/(\d{2,4})\s*year(?:s)?\s*(?:remaining|left|unexpired|lease)/i) ??
      raw.description.match(/(\d{2,4})\s*year(?:s)?\s*(?:remaining|left|unexpired)/i)
    if (m) leaseYearsRemaining = parseInt(m[1], 10)
  }

  // Property type normalisation (same buckets the Flask scraper produced)
  const typePool = `${raw.propertySubType} ${raw.keyFeatures.join(" ")}`.toLowerCase()
  const TYPE_MAP: Array<[string, string]> = [
    ["end of terrace", "end-terrace"],
    ["end-terrace", "end-terrace"],
    ["semi-detached", "semi-detached"],
    ["semi detached", "semi-detached"],
    ["terraced", "terraced"],
    ["terrace", "terraced"],
    ["detached", "detached"],
    ["apartment", "flat"],
    ["maisonette", "maisonette"],
    ["flat", "flat"],
    ["bungalow", "bungalow"],
    ["cottage", "cottage"],
    ["town house", "townhouse"],
    ["townhouse", "townhouse"],
  ]
  const propertyType =
    TYPE_MAP.find(([k]) => typePool.includes(k))?.[1] ??
    (raw.propertySubType ? raw.propertySubType.toLowerCase() : null)

  // Postcode — PAGE_MODEL outcode/incode is exact; fall back to address regex
  // (Rightmove usually shows only the outcode in the display address).
  let postcode = ""
  if (raw.outcode && raw.incode) postcode = `${raw.outcode} ${raw.incode}`
  else {
    const m = raw.address.match(/([A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2})/i)
    postcode = m ? m[1].toUpperCase().replace(/\s+/, " ").trim() : raw.outcode
  }

  // EPC rating — from features text ("EPC Rating: C"), the graph URL only
  // carries an image so rating stays null unless stated in text.
  const epcMatch =
    raw.keyFeatures.join(" ").match(/EPC\s*(?:rating)?\s*[:-]?\s*([A-G])\b/i) ??
    raw.description.match(/EPC\s*(?:rating)?\s*[:-]?\s*([A-G])\b/i)
  const epcRating = epcMatch ? epcMatch[1].toUpperCase() : null

  // Council tax band
  const ctMatch =
    (raw.councilTaxBand || "").match(/\b([A-H])\b/) ??
    raw.keyFeatures.join(" ").match(/council\s*tax\s*[:-]?\s*band\s*([A-H])/i) ??
    raw.description.match(/council\s*tax\s*[:-]?\s*band\s*([A-H])/i)
  const councilTaxBand = ctMatch ? ctMatch[1].toUpperCase() : null

  // Listing id
  const idMatch = url.match(/properties\/(\d+)/)
  const listingId = idMatch ? idMatch[1] : null

  // Added / reduced — Rightmove reports one of
  //   "Added on 12/05/2024" | "Reduced on 03/06/2024" | "Added today" …
  const updateReason = raw.listingUpdateReason
  let addedDate: string | null = null
  let reducedDate: string | null = null
  const reasonDate = updateReason.match(/(\d{2}\/\d{2}\/\d{4}|today|yesterday)/i)?.[1] ?? null
  if (/reduced/i.test(updateReason)) reducedDate = reasonDate ?? updateReason
  else if (/added/i.test(updateReason)) addedDate = reasonDate ?? updateReason

  const statusPool = `${raw.statusText} ${raw.displayPriceQualifier}`.toLowerCase()
  const isSold =
    statusPool.includes("sold stc") ||
    statusPool.includes("sold subject to contract") ||
    (raw.pageTextSample.includes("sold") && raw.pageTextSample.includes("subject to contract"))
  const isUnderOffer = statusPool.includes("under offer") || raw.pageTextSample.includes("under offer")
  const isReduced = /reduced/i.test(updateReason) || statusPool.includes("reduced")

  return {
    address: raw.address,
    postcode,
    price,
    priceText: raw.priceText,
    bedrooms: raw.bedrooms,
    bathrooms: raw.bathrooms,
    propertyType,
    tenure,
    leaseYearsRemaining,
    floorSizeSqft,
    floorSizeM2,
    images: raw.images.slice(0, 15),
    floorplanUrl: raw.floorplans[0] ?? null,
    floorplans: raw.floorplans,
    description: raw.description ? raw.description.slice(0, 4000) : null,
    keyFeatures: raw.keyFeatures,
    epcRating,
    epcUrl: raw.epcUrl,
    councilTaxBand,
    listingId,
    listingUrl: url,
    agent: raw.agentName || null,
    agentPhone: raw.agentPhone || null,
    agentAddress: raw.agentAddress || null,
    addedDate,
    reducedDate,
    originalPrice: null, // not exposed on the listing page
    isReduced,
    isSold,
    isUnderOffer,
    scrapedAt: new Date().toISOString(),
    source: "brightdata_rightmove",
  }
}
