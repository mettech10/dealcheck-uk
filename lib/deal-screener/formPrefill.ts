import type { PropertyFormData } from "@/lib/types"
import { strategyHintToInvestmentType } from "./strategy"
import type { NormalisedListingV1, StrategyHint } from "./types"

const DETAIL_MAP: Record<string, PropertyFormData["propertyTypeDetail"]> = {
  "end-terrace": "end-of-terrace",
  terraced: "terraced",
  "semi-detached": "semi-detached",
  detached: "detached",
  flat: "flat-apartment",
  maisonette: "maisonette",
  bungalow: "bungalow",
}

/**
 * Map a schemaVersion 1 listing onto the analyse form prefill.
 * Does not run calculations — Open in Metalyzi lands on the form.
 */
export function listingToFormPrefill(
  listing: NormalisedListingV1,
  strategyHint: StrategyHint,
): Partial<PropertyFormData> {
  const detail = listing.propertyType
    ? DETAIL_MAP[listing.propertyType]
    : undefined
  const broadType =
    detail === "flat-apartment" || detail === "maisonette" ? "flat" : "house"

  const mapped: Partial<PropertyFormData> = {
    address: listing.address || "",
    postcode: listing.postcode || "",
    purchasePrice: listing.price || 0,
    propertyType: broadType,
    bedrooms: listing.bedrooms ?? 0,
    investmentType: strategyHintToInvestmentType(strategyHint),
  }

  if (detail) mapped.propertyTypeDetail = detail
  if (listing.floorSizeSqft) mapped.sqft = listing.floorSizeSqft
  if (listing.tenure === "freehold" || listing.tenure === "leasehold") {
    mapped.tenureType = listing.tenure
  }
  if (listing.tenure === "leasehold" && listing.leaseYearsRemaining) {
    mapped.leaseYears = listing.leaseYearsRemaining
  }
  if (listing.monthlyRent && listing.monthlyRent > 0) {
    mapped.monthlyRent = listing.monthlyRent
  }
  if (listing.epcRating) mapped.epcBand = listing.epcRating

  return mapped
}
