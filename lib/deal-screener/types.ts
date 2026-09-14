/**
 * Deal Screener — shared types (Chrome extension + /v1/deals handoff).
 *
 * schemaVersion 1 is the contract between the MV3 extension and the
 * Metalyzi app. Keep this file free of Chrome / Next imports so both
 * sides can depend on it.
 */

/** Listing portals the screener can capture. MVP: Rightmove detail only. */
export type ScreenerListingSource = "rightmove"

/**
 * Strategy hint on the wire. Lowercase, with BRRRR spelled `brrrr`
 * (not `BRR` / `brr` — those are analyser form values).
 */
export type StrategyHint = "btl" | "brrrr" | "hmo" | "flip" | "r2sa"

export const STRATEGY_HINTS: readonly StrategyHint[] = [
  "btl",
  "brrrr",
  "hmo",
  "flip",
  "r2sa",
] as const

/** Analyser `investmentType` equivalent of a screener strategy hint. */
export type AnalyserInvestmentType = "btl" | "brr" | "hmo" | "flip" | "r2sa"

export const SCHEMA_VERSION = 1 as const

/**
 * Normalised listing posted to POST /v1/deals.
 * Photos / image URLs are deliberately absent — MVP default is photos off.
 */
export interface NormalisedListingV1 {
  source: ScreenerListingSource
  sourceListingId: string
  listingUrl: string
  address: string
  postcode: string
  price: number
  priceText: string
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
  /**
   * User-entered monthly rent. Never scraped from the portal — the
   * screener does not guess rents.
   */
  monthlyRent: number | null
}

export interface HandoffRequestV1 {
  source: "screener"
  schemaVersion: typeof SCHEMA_VERSION
  strategyHint: StrategyHint
  listing: NormalisedListingV1
}

export interface HandoffResponseV1 {
  dealId: string
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
