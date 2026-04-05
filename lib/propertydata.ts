/**
 * PropertyData API Service
 * https://api.propertydata.co.uk
 *
 * Provides UK property market data: HMO rents, rental comparables,
 * sold prices, asking prices, council tax, flood risk.
 *
 * Rate limit: max 4 requests per 10 seconds.
 * All prices in GBP. Rents returned as £/week by the API.
 */

const API_BASE = "https://api.propertydata.co.uk"
const API_KEY = process.env.PROPERTYDATA_API_KEY || ""

// ── Types ──────────────────────────────────────────────────────────────────

export interface HmoRoomData {
  points_analysed: number
  radius: string
  unit: string // "gbp_per_week"
  average: number
  "70pc_range": [number, number]
  "80pc_range": [number, number]
  "90pc_range": [number, number]
  "100pc_range": [number, number]
  raw_data: Array<{
    price: number
    lat: string
    lng: string
    bills_inc: number // 0 or 1
    distance: string
  }>
}

export interface HmoAttributes {
  furnished: number
  parking: number
  outside_space: number
  disabled_access: number
  living_room: number
  internet: number
  bills_inc: number
  couples: number
  smokers: number
  pets: number
  housing_allowance: number
  accept_males: number
  accept_females: number
}

export interface HmoRentsResponse {
  status: string
  postcode: string
  data: {
    "double-ensuite"?: HmoRoomData
    "double-shared-bath"?: HmoRoomData
    "single-ensuite"?: HmoRoomData
    "single-shared-bath"?: HmoRoomData
    attributes?: HmoAttributes
  }
}

export interface RentalListing {
  price: number // £/week
  lat: string
  lng: string
  bedrooms: number
  type: string // "terraced_house", "semi-detached_house", "flat", etc.
  distance: string
  sstc: number
  portal: string // "rightmove.co.uk", "zoopla.co.uk"
}

export interface RentsResponse {
  status: string
  postcode: string
  bedrooms?: number
  data: {
    long_let: {
      points_analysed: number
      radius: string
      unit: string
      average: number
      "70pc_range": [number, number]
      "80pc_range": [number, number]
      "90pc_range": [number, number]
      "100pc_range": [number, number]
      raw_data: RentalListing[]
    }
  }
}

export interface SoldPriceEntry {
  date: string
  address: string
  price: number
  lat: number
  lng: number
  bedrooms: number | null
  type: string // "terraced_house", "semi-detached_house", etc.
  tenure: string // "freehold", "leasehold"
  class: string // "old_stock", "new_build"
  distance: string
}

export interface SoldPricesResponse {
  status: string
  postcode: string
  max_age: number
  data: {
    points_analysed: number
    radius: string
    date_earliest: string
    date_latest: string
    average: number
    "70pc_range": [number, number]
    "80pc_range": [number, number]
    "90pc_range": [number, number]
    "100pc_range": [number, number]
    raw_data: SoldPriceEntry[]
  }
}

export interface AskingPriceEntry {
  price: number
  lat: string
  lng: string
  bedrooms: number
  type: string
  distance: string
  sstc: number
  portal: string
}

export interface PricesResponse {
  status: string
  postcode: string
  data: {
    points_analysed: number
    radius: string
    average: number
    "70pc_range": [number, number]
    "100pc_range": [number, number]
    raw_data: AskingPriceEntry[]
  }
}

export interface SoldPricesPerSqfResponse {
  status: string
  postcode: string
  data: {
    points_analysed: number
    radius: string
    average: number
    "70pc_range": [number, number]
    "100pc_range": [number, number]
    raw_data: Array<{
      price: number
      lat: number
      lng: number
      sqf: number
      price_per_sqf: number
      distance: string
    }>
  }
}

export interface CouncilTaxResponse {
  status: string
  postcode: string
  council: string
  council_rating: string
  year: string
  council_tax: Record<string, string> // band_a through band_h
  properties: Array<{ address: string; band: string }>
}

export interface FloodRiskResponse {
  status: string
  postcode: string
  flood_risk: string // "Very Low", "Low", "Medium", "High"
}

// ── Helper ─────────────────────────────────────────────────────────────────

async function apiGet<T>(
  endpoint: string,
  params: Record<string, string | number | undefined>
): Promise<T | null> {
  if (!API_KEY) {
    console.warn("[PropertyData] No API key set (PROPERTYDATA_API_KEY)")
    return null
  }

  const url = new URL(`${API_BASE}/${endpoint}`)
  url.searchParams.set("key", API_KEY)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v))
    }
  }

  try {
    console.log(`[PropertyData] GET ${endpoint} postcode=${params.postcode || "?"}`)
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(12000),
    })

    const data = await res.json()

    if (data.status === "error") {
      console.warn(`[PropertyData] ${endpoint} error:`, data.code, data.message)
      return null
    }

    console.log(`[PropertyData] ${endpoint} success`)
    return data as T
  } catch (err) {
    console.error(`[PropertyData] ${endpoint} exception:`, err)
    return null
  }
}

// ── Weekly → Monthly conversion ────────────────────────────────────────────
export function weeklyToMonthly(weeklyRent: number): number {
  return Math.round((weeklyRent * 52) / 12)
}

// ── Public API Functions ───────────────────────────────────────────────────

/**
 * Get HMO room rents by type (replaces SpareRoom Apify actor)
 * Returns room rents for: double-ensuite, double-shared-bath,
 * single-ensuite, single-shared-bath — with averages and raw data.
 */
export async function getHmoRents(
  postcode: string,
  points: number = 20
): Promise<HmoRentsResponse | null> {
  return apiGet<HmoRentsResponse>("rents-hmo", { postcode, points })
}

/**
 * Get long-let rental data (replaces Rightmove rental actor for BTL)
 * Returns asking rents with bedroom/type filters and raw listings.
 */
export async function getRents(
  postcode: string,
  bedrooms?: number,
  type?: string
): Promise<RentsResponse | null> {
  return apiGet<RentsResponse>("rents", { postcode, bedrooms, type })
}

/**
 * Get sold prices from Land Registry (replaces/supplements existing sold comparables)
 * Returns recent transactions with addresses, prices, types, tenure.
 */
export async function getSoldPrices(
  postcode: string,
  bedrooms?: number,
  type?: string
): Promise<SoldPricesResponse | null> {
  return apiGet<SoldPricesResponse>("sold-prices", { postcode, bedrooms, type })
}

/**
 * Get asking prices for sale (proxy for property valuation)
 * Returns current asking prices in area — serves as market value estimate.
 */
export async function getAskingPrices(
  postcode: string,
  bedrooms?: number,
  type?: string
): Promise<PricesResponse | null> {
  return apiGet<PricesResponse>("prices", { postcode, bedrooms, type })
}

/**
 * Get sold prices per square foot (useful for development feasibility)
 */
export async function getSoldPricesPerSqf(
  postcode: string
): Promise<SoldPricesPerSqfResponse | null> {
  return apiGet<SoldPricesPerSqfResponse>("sold-prices-per-sqf", { postcode })
}

/**
 * Get council tax information
 */
export async function getCouncilTax(
  postcode: string
): Promise<CouncilTaxResponse | null> {
  return apiGet<CouncilTaxResponse>("council-tax", { postcode })
}

/**
 * Get flood risk rating
 */
export async function getFloodRisk(
  postcode: string
): Promise<FloodRiskResponse | null> {
  return apiGet<FloodRiskResponse>("flood-risk", { postcode })
}

// ── Mapping Helpers ────────────────────────────────────────────────────────

/** Map PropertyData property type string to readable label */
export function mapPropertyType(raw: string): string {
  const MAP: Record<string, string> = {
    terraced_house: "Terraced",
    semi_detached_house: "Semi-Detached",
    "semi-detached_house": "Semi-Detached",
    detached_house: "Detached",
    flat: "Flat",
    unknown: "Unknown",
  }
  return MAP[raw] || raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Map HMO room type key to readable label */
export function mapRoomType(key: string): string {
  const MAP: Record<string, string> = {
    "double-ensuite": "Double (Ensuite)",
    "double-shared-bath": "Double (Shared Bath)",
    "single-ensuite": "Single (Ensuite)",
    "single-shared-bath": "Single (Shared Bath)",
  }
  return MAP[key] || key
}
