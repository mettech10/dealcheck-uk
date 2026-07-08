/**
 * Adapter: RightmoveListing (Bright Data scraper) → the camelCase
 * `propertyData` shape that /api/analyse scrape-only has always returned.
 * Keeping the output identical means the analyse form's pre-fill mapping
 * and PropertyListingCard display need no changes.
 */
import type { RightmoveListing } from "./rightmove-listing-scraper"

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

export function listingToPropertyData(listing: RightmoveListing) {
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
