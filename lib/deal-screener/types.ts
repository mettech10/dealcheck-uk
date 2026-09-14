/**
 * Deal Screener types — wire contract matches Flask
 * `POST /v1/deals` (metusa-deal-analyzer PR #92).
 *
 * Next.js is not the source of truth for deals. The extension POSTs
 * Flask `POST /v1/deals` directly. Next only hydrates
 * `GET /api/v1/deals/:id` from shared `deals` (+ `properties`) under
 * user RLS. Photos stay off.
 */

/** Listing portals the screener can capture. MVP: Rightmove detail only. */
export type ScreenerListingSource = "rightmove"

/**
 * strategyHint on the Flask wire: lowercase enums.
 * `r2sa` maps to `sa`. Omitted / empty / OTHER → `btl` on the server.
 */
export type StrategyHint = "btl" | "hmo" | "brrrr" | "flip" | "sa" | "development"

export const STRATEGY_HINTS: readonly StrategyHint[] = [
  "btl",
  "hmo",
  "brrrr",
  "flip",
  "sa",
  "development",
] as const

/** Analyser `investmentType` equivalent of a Flask strategy hint. */
export type AnalyserInvestmentType =
  | "btl"
  | "brr"
  | "hmo"
  | "flip"
  | "r2sa"
  | "development"

export const SCHEMA_VERSION = 1 as const

/**
 * SchemaVersion 1 listing posted to Flask POST /v1/deals.
 * Canonical field names: listingUrl, priceGbp, rentPcmGbp, bedrooms.
 * Aliases (sourceUrl, price, monthlyRent, beds) are accepted on ingest
 * but not emitted on the wire. Photos / image URLs are absent.
 */
export interface NormalisedListingV1 {
  source: ScreenerListingSource
  sourceListingId: string
  listingUrl: string
  address: string
  postcode: string
  priceGbp: number
  rentPcmGbp: number | null
  bedrooms: number | null
  bathrooms: number | null
  propertyType: string | null
  tenure: string | null
  leaseYearsRemaining: number | null
  floorSizeSqft: number | null
  floorSizeM2: number | null
  description: string | null
  keyFeatures: string[]
  epcRating: string | null
  councilTaxBand: string | null
  agentName: string | null
  agentPhone: string | null
  isSold: boolean
  isUnderOffer: boolean
  isReduced: boolean
  capturedAt: string
}

export interface HandoffRequestV1 {
  source: "screener"
  schemaVersion: typeof SCHEMA_VERSION
  /** Omitted when btl so Flask defaults. */
  strategyHint?: StrategyHint
  listing: NormalisedListingV1
}

export interface HandoffResponseV1 {
  dealId: string
  propertyId?: string
  status: "created" | "existing"
  deepLinkPath: string
}

export interface ScreenerRules {
  maxPrice: number
  minBeds: number
  minGrossYield: number
  minSimpleCashflow: number
  /** Empty allow-list = no strategy restriction. */
  strategies: StrategyHint[]
}

export interface ScreenerRulesPreset {
  id: string
  name: string
  rules: ScreenerRules
}

export type RuleId =
  | "maxPrice"
  | "minBeds"
  | "minGrossYield"
  | "minSimpleCashflow"
  | "strategyAllowList"

export type RuleOutcomeStatus = "pass" | "fail" | "pending"

export interface RuleOutcome {
  id: RuleId
  label: string
  status: RuleOutcomeStatus
  actual: string
  required: string
  detail?: string
}

export interface ScreenMetrics {
  grossYield: number | null
  simpleCashflow: number | null
}

export interface ScreenVerdict {
  pass: boolean
  metrics: ScreenMetrics
  outcomes: RuleOutcome[]
}

/**
 * Raw fields collected in the Rightmove page MAIN world.
 * No photo URLs — collection strips media before it leaves the tab.
 */
export interface CollectedRightmovePage {
  href: string
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
  floorSizeSqft: number | null
  floorSizeM2: number | null
  description: string
  keyFeatures: string[]
  epcUrl: string | null
  councilTaxBand: string
  agentName: string
  agentPhone: string
  listingUpdateReason: string
  statusText: string
  pageTextSample: string
}
