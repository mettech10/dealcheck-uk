/**
 * Shared types for the Metalyzi Licensing Checker (P0–P1).
 *
 * Traffic lights are the only status vocabulary the UI may render.
 * `legalClearance` is always false — this is a screening aid, never a
 * determination that a property is licensed, exempt, or planning-clear.
 */

export const TRAFFIC_LIGHTS = ["red", "amber", "green", "grey"] as const
export type TrafficLight = (typeof TRAFFIC_LIGHTS)[number]

export type LicensingFlagId =
  | "mandatory_hmo"
  | "additional_hmo"
  | "selective"
  | "article4_c3_c4"

export type LicensingFlagStatus =
  | "in_force"
  | "may_apply"
  | "not_triggered"
  | "not_indicated"
  | "proposed"
  | "unknown"
  | "out_of_coverage"

export type LicensingSeverity = "high" | "medium" | "low" | "info"
export type LicensingConfidence = "high" | "medium" | "low" | "none"

export type LicensingNation =
  | "England"
  | "Scotland"
  | "Wales"
  | "Northern Ireland"
  | "unknown"

export type LicensingIntendedUse = "btl" | "hmo" | "sa" | "flip" | "other"

export interface LicensingSource {
  name: string
  url: string
}

export interface LicensingFreshness {
  /** ISO date the checker assembled this flag. */
  asOf: string
  /** ISO date of the underlying source / statute / snapshot, if known. */
  sourceUpdatedAt: string | null
  label: string
}

export interface LicensingFlag {
  id: LicensingFlagId
  label: string
  trafficLight: TrafficLight
  severity: LicensingSeverity
  confidence: LicensingConfidence
  status: LicensingFlagStatus
  summary: string
  freshness: LicensingFreshness
  sources: LicensingSource[]
}

export type LicensingBannerId =
  | "planning_data_a4_incomplete"
  | "england_first"
  | "not_legal_clearance"

export interface LicensingBanner {
  id: LicensingBannerId
  tone: "amber" | "grey" | "info"
  title: string
  body: string
}

export interface LicensingLocation {
  postcode: string
  district: string | null
  sector: string | null
  council: string | null
  country: LicensingNation
}

export interface LicensingCoverage {
  nation: LicensingNation
  supported: boolean
  englandFirst: true
}

export interface LicensingCheckResult {
  ok: true
  /** Always false. The UI must never invert or hide this. */
  legalClearance: false
  disclaimer: string
  coverage: LicensingCoverage
  location: LicensingLocation
  banners: LicensingBanner[]
  flags: LicensingFlag[]
  overallTrafficLight: TrafficLight
  overallLabel: string
  checkedAt: string
  flag: "licensing_checker_v1"
}

export interface LicensingCheckInput {
  postcode: string
  occupants?: number | null
  rooms?: number | null
  intendedUse?: LicensingIntendedUse | null
}

export interface LicensingGeo {
  postcode: string
  country: LicensingNation
  council: string | null
  district: string | null
  sector: string | null
}

/** Compact model for the Deal Discovery badge hook. Never used as a filter. */
export interface LicensingBadgeModel {
  trafficLight: TrafficLight
  label: string
}

export const LEGAL_CLEARANCE_DISCLAIMER =
  "This is a screening aid, not legal advice and not a licence or planning determination. Metalyzi never grants legal clearance. Confirm the current designation, boundary, fees, exemptions and permitted-development position with the local housing authority and local planning authority before exchanging or occupying."

export const PLANNING_DATA_A4_BANNER: LicensingBanner = {
  id: "planning_data_a4_incomplete",
  tone: "amber",
  title: "Planning Data Article 4 coverage is incomplete",
  body: "C3→C4 Article 4 status is merged from planning.data.gov.uk and Metalyzi’s curated table. National coverage lags local designations and some polygons are missing or opaquely labelled. A green light is not confirmation that permitted development applies.",
}

export const ENGLAND_FIRST_BANNER: LicensingBanner = {
  id: "england_first",
  tone: "grey",
  title: "England first",
  body: "This checker currently covers England. Scotland, Wales and Northern Ireland use different HMO and landlord licensing regimes — verify with the relevant local authority. No result here is legal clearance.",
}

export const NOT_LEGAL_CLEARANCE_BANNER: LicensingBanner = {
  id: "not_legal_clearance",
  tone: "info",
  title: "Not legal clearance",
  body: LEGAL_CLEARANCE_DISCLAIMER,
}

/** Phrases the checker must never emit. Tests scan every assembled string. */
export const FORBIDDEN_CLEARANCE_PHRASES = [
  "legal clearance",
  "legally cleared",
  "legally compliant",
  "you are compliant",
  "no licence required",
  "no license required",
  "you do not need a licence",
  "you don't need a licence",
  "planning clearance",
  "fully licensed",
  "cleared for occupation",
] as const
