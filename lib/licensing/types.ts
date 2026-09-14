/**
 * Display types for the Metalyzi Licensing Checker.
 *
 * Flask `metusa-deal-analyzer` `/v1/licensing/check` is the source of truth.
 * Next maps the response for UI only — it must not compute licensing.
 *
 * Traffic lights are the only status vocabulary the UI may render.
 * `legalClearance` is always false — this is a screening aid, never a
 * determination that a property is licensed, exempt, or planning-clear.
 */

export const TRAFFIC_LIGHTS = ["red", "amber", "green", "grey"] as const
export type TrafficLight = (typeof TRAFFIC_LIGHTS)[number]

export const SEVERITY_CLASSES = [
  "deal_killer",
  "compliance_cost",
  "soft_warning",
  "info",
] as const
export type SeverityClass = (typeof SEVERITY_CLASSES)[number]

export type LicensingApplies = "yes" | "no" | "possible" | "conditional"

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

/** Analyse / tools form uses. Mapped to Flask `intended_use` in request.ts. */
export type LicensingIntendedUse = "btl" | "hmo" | "sa" | "flip" | "other"

/** Flask `/v1/licensing/check` intended_use vocabulary. */
export type FlaskIntendedUse = "hmo" | "btl" | "sa" | "str" | "rental" | "unknown"

export interface LicensingSource {
  name: string
  url?: string | null
}

export interface LicensingFreshness {
  /** ISO date the checker assembled this flag. */
  asOf: string
  /** ISO date of the underlying source / statute / snapshot, if known. */
  sourceUpdatedAt: string | null
  label: string
  stale?: boolean
}

export interface LicensingFlag {
  id: string
  label: string
  trafficLight: TrafficLight
  severityClass: SeverityClass
  severity: LicensingSeverity
  applies: LicensingApplies
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
  | "stale_data"

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

export interface LicensingFeeItem {
  id?: string
  flag_id?: string
  kind?: string
  label?: string
  min_gbp?: number | null
  max_gbp?: number | null
  range_text?: string | null
  term_years?: number | null
  known?: boolean
  currency?: string
}

export interface LicensingKiller {
  flag_id?: string
  title?: string
  summary?: string
  applies?: string
}

export interface LicensingRiskNote {
  id?: string
  flag_id?: string
  kind?: string
  deal_impact?: string
  summary?: string
}

export interface LicensingDealImpact {
  level: SeverityClass | string
  verdict: string
  killers: LicensingKiller[]
  drivers: unknown[]
  fee_hooks: unknown[]
  estimated_licence_fees_gbp: {
    currency?: string
    min: number | null
    max: number | null
    known: boolean
    items: LicensingFeeItem[]
  }
  analyse_hooks: {
    add_capex_lines: LicensingFeeItem[]
    add_risk_notes: LicensingRiskNote[]
  }
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
  dealImpact: LicensingDealImpact | null
  overallTrafficLight: TrafficLight
  overallLabel: string
  checkedAt: string
  flag: "licensing_checker_v1"
}

export interface LicensingCheckInput {
  postcode: string
  occupants?: number | null
  /** Occupancy proxy only — never sent to Flask as `rooms`. */
  rooms?: number | null
  households?: number | null
  sharingAmenities?: boolean | null
  intendedUse?: LicensingIntendedUse | null
  conversionFromC3?: boolean | null
  purposeBuiltFlat?: boolean | null
  flatsInBlock?: number | null
  purposeBuiltFlatInBlockOf3Plus?: boolean | null
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
  body: "C3→C4 Article 4 status is resolved by the analyzer from planning.data.gov.uk. National coverage lags local designations and some polygons are missing or opaquely labelled. Absence of a hit is not confirmation that permitted development applies.",
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

export const STALE_DATA_BANNER: LicensingBanner = {
  id: "stale_data",
  tone: "amber",
  title: "Some licensing data is stale",
  body: "One or more scheme or geo components are past their re-verify window. Treat hits as indicative and confirm current designations with the local authority.",
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
