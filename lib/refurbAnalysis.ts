"use client"

/**
 * AI Refurb Estimator — client caller + result types.
 *
 * runRefurbAnalysis posts the scraped listing photos and deal context to
 * our session-gated /api/analysis/refurb vision route and returns the
 * structured breakdown, or null on ANY failure — callers treat null as
 * "fall back to the static tier table".
 */

export interface RefurbRoom {
  room: string
  condition: "poor" | "fair" | "good" | "excellent"
  visible: boolean
  workNeeded: string[]
  isEssential: boolean
  costLow: number
  costMid: number
  costHigh: number
  notes: string
}

export interface RefurbAdditionalItem {
  item: string
  reason: string
  isEssential: boolean
  costLow: number
  costMid: number
  costHigh: number
}

export interface RefurbRedFlag {
  flag: string
  location: string
  severity: "low" | "medium" | "high"
  estimatedCost: number
  recommendation: string
}

export interface RefurbAnalysisResult {
  overallCondition: string
  conditionConfidence: string
  conditionReasoning: string
  rooms: RefurbRoom[]
  additionalItems: RefurbAdditionalItem[]
  photosAnalysed: number
  roomsVisible: string[]
  roomsNotVisible: string[]
  totals: {
    essentialOnlyLow: number
    essentialOnlyMid: number
    essentialOnlyHigh: number
    fullRefurbLow: number
    fullRefurbMid: number
    fullRefurbHigh: number
  }
  strategyRecommendation: {
    recommended: string
    reasoning: string
    estimatedValueAdd: number
    estimatedRentIncrease: number
  }
  redFlags: RefurbRedFlag[]
  limitations: string[]
  analysedByAI: boolean
  photosUsed: number
  region: string
  regionalMultiplier: number
  fromCache?: boolean
  fallback?: boolean
}

export interface RefurbAnalysisParams {
  images: string[]
  bedrooms: number | null
  bathrooms: number | null
  propertyType: string | null
  floorSizeM2: number | null
  floorSizeSqft: number | null
  postcode: string
  region: string
  strategy: string
  condition: string | null
  purchasePrice: number
}

export async function runRefurbAnalysis(
  params: RefurbAnalysisParams,
): Promise<RefurbAnalysisResult | null> {
  if (params.images.length === 0) return null

  console.log("[REFURB] starting", {
    photos: params.images.length,
    postcode: params.postcode,
    strategy: params.strategy,
  })

  try {
    const response = await fetch("/api/analysis/refurb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    })

    const result = await response.json().catch(() => null)

    if (!response.ok || !result || result.fallback) {
      console.warn("[REFURB] unavailable — static estimates will show", {
        status: response.status,
        error: result?.error,
      })
      return null
    }

    // Defensive normalisation — a malformed model response must never
    // crash the results page.
    if (!result.totals || !Array.isArray(result.rooms)) return null
    result.rooms = result.rooms.filter(
      (r: RefurbRoom) => r && typeof r.room === "string",
    )
    result.additionalItems = Array.isArray(result.additionalItems)
      ? result.additionalItems
      : []
    result.redFlags = Array.isArray(result.redFlags) ? result.redFlags : []
    result.roomsVisible = Array.isArray(result.roomsVisible)
      ? result.roomsVisible
      : []
    result.roomsNotVisible = Array.isArray(result.roomsNotVisible)
      ? result.roomsNotVisible
      : []
    result.limitations = Array.isArray(result.limitations)
      ? result.limitations
      : []

    console.log("[REFURB] done", {
      condition: result.overallCondition,
      rooms: result.rooms.length,
      totalMid: result.totals.fullRefurbMid,
      redFlags: result.redFlags.length,
      fromCache: !!result.fromCache,
    })

    return result as RefurbAnalysisResult
  } catch (err) {
    console.warn(
      "[REFURB] failed — static estimates will show:",
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}
