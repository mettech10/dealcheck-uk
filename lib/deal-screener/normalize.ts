import { extractCouncilTaxBand } from "../councilTax"
import type {
  CollectedRightmovePage,
  NormalisedListingV1,
  ScreenerListingSource,
} from "./types"

const PHOTO_KEYS = [
  "images",
  "image",
  "photos",
  "photo",
  "photoUrls",
  "imageUrls",
  "gallery",
  "floorplans",
  "floorplan",
  "floorplanUrl",
  "media",
  "thumbnail",
  "thumbnailUrl",
] as const

export function isRightmoveListingDetailUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (!/(^|\.)rightmove\.co\.uk$/i.test(u.hostname)) return false
    return /\/properties\/\d+/.test(u.pathname)
  } catch {
    return false
  }
}

export function listingIdFromUrl(url: string): string | null {
  const m = url.match(/\/properties\/(\d+)/)
  return m ? m[1] : null
}

function parsePrice(priceText: string): number {
  const priced = priceText.match(/£\s*([\d,]+)/)
  if (priced) return parseInt(priced[1].replace(/,/g, ""), 10)
  return parseInt(priceText.replace(/[^0-9]/g, ""), 10) || 0
}

function parsePostcode(
  address: string,
  outcode: string,
  incode: string,
): string {
  if (outcode && incode) return `${outcode} ${incode}`.trim()
  const m = address.match(/([A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2})/i)
  if (m) return m[1].toUpperCase().replace(/\s+/, " ").trim()
  return outcode || ""
}

function parseTenure(
  tenureType: string,
  keyFeatures: string[],
): string | null {
  const pool = `${tenureType} ${keyFeatures.join(" ")}`.toLowerCase()
  if (pool.includes("share of freehold")) return "share-of-freehold"
  if (pool.includes("freehold")) return "freehold"
  if (pool.includes("leasehold")) return "leasehold"
  return tenureType ? tenureType.toLowerCase() : null
}

function parsePropertyType(
  propertySubType: string,
  keyFeatures: string[],
): string | null {
  const typePool = `${propertySubType} ${keyFeatures.join(" ")}`.toLowerCase()
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
  return (
    TYPE_MAP.find(([k]) => typePool.includes(k))?.[1] ??
    (propertySubType ? propertySubType.toLowerCase() : null)
  )
}

function parseEpc(keyFeatures: string[], description: string): string | null {
  const m =
    keyFeatures.join(" ").match(/EPC\s*(?:rating)?\s*[:-]?\s*([A-G])\b/i) ??
    description.match(/EPC\s*(?:rating)?\s*[:-]?\s*([A-G])\b/i)
  return m ? m[1].toUpperCase() : null
}

function fillFloorSize(
  sqft: number | null,
  m2: number | null,
  keyFeatures: string[],
  description: string,
): { floorSizeSqft: number | null; floorSizeM2: number | null } {
  let floorSizeSqft = sqft
  let floorSizeM2 = m2
  if (!floorSizeSqft && !floorSizeM2) {
    const textPool = [keyFeatures.join(" "), description].join(" ")
    const sqftMatch = textPool.match(
      /([0-9][0-9,]*(?:\.\d+)?)\s*(?:sq\.?\s*ft|ft²|sqft|square\s*feet)\b/i,
    )
    const m2Match = textPool.match(
      /([0-9][0-9,]*(?:\.\d+)?)\s*(?:sq\.?\s*m|m²|m2|sqm|square\s*met(?:re|er)s?)\b/i,
    )
    if (sqftMatch) {
      const v = parseFloat(sqftMatch[1].replace(/,/g, ""))
      if (v >= 100 && v <= 20000) floorSizeSqft = Math.round(v)
    } else if (m2Match) {
      const v = parseFloat(m2Match[1].replace(/,/g, ""))
      if (v >= 10 && v <= 2000) floorSizeM2 = Math.round(v * 10) / 10
    }
  }
  if (floorSizeSqft && !floorSizeM2) {
    floorSizeM2 = Math.round(floorSizeSqft * 0.0929 * 10) / 10
  }
  if (floorSizeM2 && !floorSizeSqft) {
    floorSizeSqft = Math.round(floorSizeM2 * 10.764)
  }
  return { floorSizeSqft, floorSizeM2 }
}

/**
 * Strip any photo / media keys that a caller might have attached.
 * Defence in depth for the photos-off default.
 */
export function stripPhotos<T extends Record<string, unknown>>(input: T): T {
  const out = { ...input }
  for (const key of PHOTO_KEYS) {
    if (key in out) delete out[key]
  }
  return out
}

export function emptyCollectedPage(href: string): CollectedRightmovePage {
  return {
    href,
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
    floorSizeSqft: null,
    floorSizeM2: null,
    description: "",
    keyFeatures: [],
    epcUrl: null,
    councilTaxBand: "",
    agentName: "",
    agentPhone: "",
    listingUpdateReason: "",
    statusText: "",
    pageTextSample: "",
  }
}

/**
 * Turn a MAIN-world collect payload into schemaVersion 1.
 * Photos are never copied across.
 */
export function normaliseCollectedListing(
  raw: CollectedRightmovePage,
  monthlyRent: number | null = null,
  capturedAt = new Date().toISOString(),
): NormalisedListingV1 {
  const listingUrl = raw.href.split("#")[0].split("?")[0]
  const sourceListingId = listingIdFromUrl(listingUrl) ?? ""
  const { floorSizeSqft, floorSizeM2 } = fillFloorSize(
    raw.floorSizeSqft,
    raw.floorSizeM2,
    raw.keyFeatures,
    raw.description,
  )

  const statusPool =
    `${raw.statusText} ${raw.displayPriceQualifier} ${raw.pageTextSample}`.toLowerCase()
  const updateReason = raw.listingUpdateReason

  const listing: NormalisedListingV1 = {
    source: "rightmove" satisfies ScreenerListingSource,
    sourceListingId,
    listingUrl,
    address: raw.address.trim(),
    postcode: parsePostcode(raw.address, raw.outcode, raw.incode),
    price: parsePrice(raw.priceText),
    priceText: raw.priceText.trim(),
    bedrooms: raw.bedrooms,
    bathrooms: raw.bathrooms,
    propertyType: parsePropertyType(raw.propertySubType, raw.keyFeatures),
    tenure: parseTenure(raw.tenureType, raw.keyFeatures),
    leaseYearsRemaining:
      raw.leaseYears && raw.leaseYears > 0 ? raw.leaseYears : null,
    floorSizeSqft,
    floorSizeM2,
    description: raw.description ? raw.description.slice(0, 4000) : null,
    keyFeatures: raw.keyFeatures.filter(Boolean).slice(0, 30),
    epcRating: parseEpc(raw.keyFeatures, raw.description),
    councilTaxBand: extractCouncilTaxBand(
      raw.councilTaxBand,
      raw.keyFeatures,
      raw.description,
    ),
    agentName: raw.agentName || null,
    agentPhone: raw.agentPhone || null,
    isSold:
      statusPool.includes("sold stc") ||
      statusPool.includes("sold subject to contract"),
    isUnderOffer: statusPool.includes("under offer"),
    isReduced: /reduced/i.test(updateReason) || statusPool.includes("reduced"),
    capturedAt,
    monthlyRent:
      monthlyRent != null && monthlyRent > 0 ? monthlyRent : null,
  }

  return stripPhotos(listing as unknown as Record<string, unknown>) as unknown as NormalisedListingV1
}
