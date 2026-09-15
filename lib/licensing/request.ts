/**
 * Build the Flask `/v1/licensing/check` payload from Analyse / tools input.
 * Mapping only — no licensing rules.
 */

import type { PropertyFormData } from "@/lib/types"
import type {
  FlaskIntendedUse,
  LicensingCheckInput,
  LicensingIntendedUse,
} from "./types"

export function toFlaskIntendedUse(
  use: LicensingIntendedUse | string | null | undefined,
): FlaskIntendedUse {
  const v = (use ?? "").trim().toLowerCase()
  if (v === "hmo" || v === "c4" || v === "sui_generis") return "hmo"
  if (v === "btl" || v === "c3") return "btl"
  if (v === "sa" || v === "r2sa" || v === "str") return "sa"
  if (v === "rental") return "rental"
  return "unknown"
}

export function parseLicensingIntendedUse(raw: unknown): LicensingIntendedUse | null {
  if (typeof raw !== "string") return null
  const v = raw.trim().toLowerCase()
  if (v === "btl" || v === "hmo" || v === "sa" || v === "flip" || v === "other") return v
  if (v === "brr" || v === "brrrr") return "other"
  if (v === "r2sa" || v === "str") return "sa"
  if (v === "rental" || v === "unknown") return "other"
  return null
}

/**
 * HMO / BRR-HMO is a C3→C4 conversion play. BTL / SA / flip is continued use.
 * Omit when the strategy does not tell us.
 */
export function conversionFromC3FromAnalyse(
  data: Pick<PropertyFormData, "investmentType" | "brrrExitStrategy">,
): boolean | undefined {
  if (data.investmentType === "hmo" || data.brrrExitStrategy === "hmo") return true
  if (
    data.investmentType === "btl" ||
    data.investmentType === "r2sa" ||
    data.investmentType === "flip" ||
    data.brrrExitStrategy === "btl" ||
    data.brrrExitStrategy === "sa"
  ) {
    return false
  }
  return undefined
}

/**
 * Only when known. A generic "flat" is not assumed purpose-built; omit and
 * let Flask keep the carve-out conditional. Houses are not purpose-built flats.
 */
export function purposeBuiltFlatFromAnalyse(
  data: Pick<PropertyFormData, "propertyType">,
): boolean | undefined {
  if (data.propertyType === "house") return false
  return undefined
}

export function licensingInputFromAnalyse(data: PropertyFormData): LicensingCheckInput {
  const hmo = data.investmentType === "hmo" || data.brrrExitStrategy === "hmo"
  const rooms = data.roomCount ?? (hmo ? data.bedrooms : undefined)
  const occupants = hmo ? rooms ?? undefined : undefined
  const households = hmo && occupants != null && occupants >= 2 ? occupants : undefined

  let intendedUse: LicensingIntendedUse = "other"
  if (hmo) intendedUse = "hmo"
  else if (data.investmentType === "r2sa") intendedUse = "sa"
  else if (data.investmentType === "flip") intendedUse = "flip"
  else if (data.investmentType === "btl" || data.brrrExitStrategy === "btl") intendedUse = "btl"

  return {
    postcode: data.postcode,
    occupants: occupants ?? null,
    households: households ?? null,
    sharingAmenities: hmo ? true : null,
    intendedUse,
    conversionFromC3: conversionFromC3FromAnalyse(data) ?? null,
    purposeBuiltFlat: purposeBuiltFlatFromAnalyse(data) ?? null,
    flatsInBlock: null,
  }
}

/**
 * Flask JSON body. Never includes `skip_article4` (test hook) or a `rooms`
 * field — rooms may only fill `occupants` when occupancy is otherwise unknown.
 */
export function buildFlaskLicensingPayload(
  input: LicensingCheckInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    postcode: (input.postcode ?? "").trim(),
  }

  const occupants = input.occupants ?? input.rooms ?? null
  if (occupants != null) body.occupants = occupants
  if (input.households != null) body.households = input.households
  if (input.sharingAmenities != null) body.sharing_amenities = input.sharingAmenities
  if (input.intendedUse) body.intended_use = toFlaskIntendedUse(input.intendedUse)
  if (input.conversionFromC3 != null) body.conversion_from_c3 = input.conversionFromC3
  if (input.purposeBuiltFlat != null) body.purpose_built_flat = input.purposeBuiltFlat
  if (input.flatsInBlock != null) body.flats_in_block = input.flatsInBlock
  if (input.purposeBuiltFlatInBlockOf3Plus != null) {
    body.purpose_built_flat_in_block_of_3_plus = input.purposeBuiltFlatInBlockOf3Plus
  }
  return body
}
