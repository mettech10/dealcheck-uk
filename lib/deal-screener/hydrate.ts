import { listingToFormPrefill } from "./formPrefill"
import { toFlaskListing } from "./handoff"
import { normaliseStrategyHint } from "./strategy"
import type { NormalisedListingV1, StrategyHint } from "./types"

export interface DealRowForHydrate {
  id: string
  property_id?: string | null
  strategy?: string | null
  rent_pcm_gbp?: number | string | null
  listing?: Record<string, unknown> | null
  status?: string | null
}

/** Discovery / Flask property spine fields used to fill listing gaps. */
export interface PropertySpineRow {
  id?: string | null
  canonical_address?: string | null
  postcode?: string | null
  bedrooms?: number | null
  bathrooms?: number | null
  property_type?: string | null
  tenure?: string | null
}

export interface HydratedDeal {
  dealId: string
  propertyId: string | null
  status: "created" | "existing"
  strategyHint: StrategyHint
  listing: NormalisedListingV1 & { sourceUrl: string; beds: number | null }
  formPrefill: ReturnType<typeof listingToFormPrefill>
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim()
}

/**
 * Fill blank listing fields from the shared `properties` row
 * (`canonical_address`, beds, postcode, type, tenure).
 */
export function mergePropertySpine(
  listingRaw: Record<string, unknown>,
  property: PropertySpineRow | null | undefined,
): Record<string, unknown> {
  if (!property) return { ...listingRaw }
  const out = { ...listingRaw }
  if (!asStr(out.address) && property.canonical_address) {
    out.address = property.canonical_address
  }
  if (!asStr(out.postcode) && property.postcode) {
    out.postcode = property.postcode
  }
  if (out.bedrooms == null && out.beds == null && property.bedrooms != null) {
    out.bedrooms = property.bedrooms
  }
  if (out.bathrooms == null && out.baths == null && property.bathrooms != null) {
    out.bathrooms = property.bathrooms
  }
  if (!asStr(out.propertyType) && property.property_type) {
    out.propertyType = property.property_type
  }
  if (!asStr(out.tenure) && property.tenure) {
    out.tenure = property.tenure
  }
  return out
}

function withWireAliases(
  listing: NormalisedListingV1,
): NormalisedListingV1 & { sourceUrl: string; beds: number | null } {
  return {
    ...listing,
    sourceUrl: listing.listingUrl,
    beds: listing.bedrooms,
  }
}

/**
 * Map a shared `deals` row (Flask SoT) into analyse-form prefill.
 * Does not run analysis. Photos stay stripped.
 */
export function hydrateFromDealRow(
  row: DealRowForHydrate,
  property?: PropertySpineRow | null,
): HydratedDeal {
  let listingRaw: Record<string, unknown> = { ...(row.listing ?? {}) }
  if (
    listingRaw.rentPcmGbp == null &&
    listingRaw.monthlyRent == null &&
    listingRaw.rent == null &&
    row.rent_pcm_gbp != null
  ) {
    listingRaw.rentPcmGbp = Number(row.rent_pcm_gbp)
  }
  listingRaw = mergePropertySpine(listingRaw, property)

  const listing = withWireAliases(toFlaskListing(listingRaw))
  const strategyHint = normaliseStrategyHint(row.strategy) ?? "btl"
  const propertyIdRaw = row.property_id ?? listingRaw.propertyId
  const propertyId = propertyIdRaw ? String(propertyIdRaw) : null

  return {
    dealId: row.id,
    propertyId,
    status: row.status === "existing" ? "existing" : "created",
    strategyHint,
    listing,
    formPrefill: listingToFormPrefill(listing, strategyHint),
  }
}
