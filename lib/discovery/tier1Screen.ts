/**
 * Tier 1 — fast, cheap screen. Runs on EVERY listing a search finds.
 *
 * Hard constraints (non-negotiable):
 *   • no live scraping per listing
 *   • no AI calls per listing
 *   • cached/aggregated area data only, resolved once per DISTRICT and
 *     memoised (see ./areaIntel), so screening 90 listings in 3 districts
 *     costs 3 district resolves, not 90.
 *
 * Honesty rules baked in:
 *   • a metric with no real backing stays null and its signal is NOT raised —
 *     we never substitute a national average and label it as area data
 *   • Article 4 "unknown" is never reported as "none"; an ACTIVE direction
 *     always downgrades the HMO signal, it can never be hidden to make a
 *     listing look better
 */
import { getDistrictIntel, toDistrict, type DistrictIntel } from "./areaIntel"

export interface ListingCandidate {
  listingUrl: string
  listingId: string
  address: string
  postcode: string
  price: number
  bedrooms: number | null
  propertyType: string | null
  thumbnailUrl: string | null
  description: string | null
}

export type SignalStrength = "strong" | "moderate" | "weak"

export interface StrategySignal {
  strategy: string
  signal: SignalStrength
  reason: string
}

export interface Tier1Signals {
  /** % below the area median sale price (positive = cheaper than area). */
  bmvPct: number | null
  estimatedGrossYield: number | null
  estimatedHmoYield: number | null
  estimatedSaRevenue: number | null
  article4Status: string
  areaConfidence: string
  dominantAreaStrategy: string | null
  hasRefurbLanguage: boolean
  roomPotential: number | null
  /** Which data sources actually backed these numbers. */
  dataSources: string[]
  /** Metrics we could not compute for lack of area data — shown in the UI. */
  missingData: string[]
}

export interface Tier1Result {
  signals: Tier1Signals
  score: number
  strategySignals: StrategySignal[]
  passesThreshold: boolean
}

/** Listing copy that suggests a refurb/value-add opportunity. */
const REFURB_KEYWORDS = [
  "requires modernisation",
  "requires updating",
  "requires renovation",
  "needs refurbishment",
  "needs modernising",
  "in need of renovation",
  "in need of modernisation",
  "no onward chain",
  "potential to extend",
  "scope to improve",
  "scope for improvement",
  "renovation project",
  "update throughout",
  "modernisation throughout",
  "cash buyers only",
  "auction",
  "in need of some tlc",
  "needs some tlc",
]

/** Strategy keys are normalised so 'btl' | 'BTL' both work. */
function wants(strategies: string[], key: string): boolean {
  return strategies.some((s) => s.trim().toUpperCase() === key)
}

export async function screenListing(
  listing: ListingCandidate,
  targetStrategies: string[],
): Promise<Tier1Result> {
  const district = toDistrict(listing.postcode || listing.address)
  const intel: DistrictIntel = await getDistrictIntel(district)

  const a4Status = intel.article4?.status ?? "unknown"
  const missingData: string[] = []

  const signals: Tier1Signals = {
    bmvPct: null,
    estimatedGrossYield: null,
    estimatedHmoYield: null,
    estimatedSaRevenue: null,
    article4Status: a4Status,
    areaConfidence: intel.confidenceLevel,
    dominantAreaStrategy: intel.dominantStrategy,
    hasRefurbLanguage: false,
    roomPotential: null,
    dataSources: intel.sources,
    missingData,
  }

  // ── BMV signal — price vs area median sale price ──────────────────────
  if (intel.medianSoldPrice && listing.price > 0) {
    signals.bmvPct = Math.round(
      ((intel.medianSoldPrice - listing.price) / intel.medianSoldPrice) * 100,
    )
  } else {
    missingData.push("area median sale price")
  }

  // ── Refurb language ───────────────────────────────────────────────────
  const descLower = (listing.description ?? "").toLowerCase()
  signals.hasRefurbLanguage =
    descLower.length > 0 && REFURB_KEYWORDS.some((kw) => descLower.includes(kw))

  // ── Estimated single-let gross yield ──────────────────────────────────
  if (intel.medianMonthlyRent && listing.price > 0) {
    signals.estimatedGrossYield =
      Math.round(((intel.medianMonthlyRent * 12) / listing.price) * 1000) / 10
  } else if (intel.medianBtlGrossYield) {
    // Fall back to the area's own measured median yield (still area data).
    signals.estimatedGrossYield = intel.medianBtlGrossYield
  } else {
    missingData.push("area rent / BTL yield")
  }

  // ── HMO potential ─────────────────────────────────────────────────────
  const beds = listing.bedrooms ?? 0
  if (wants(targetStrategies, "HMO") && beds >= 3) {
    // A 3-bed can usually make 4 lettable rooms after a reception conversion;
    // 5+ beds are taken at face value.
    signals.roomPotential = beds >= 5 ? beds : beds + 1
    if (intel.medianRoomRent && listing.price > 0) {
      const grossHmoRent = intel.medianRoomRent * signals.roomPotential
      signals.estimatedHmoYield =
        Math.round(((grossHmoRent * 12) / listing.price) * 1000) / 10
    } else if (intel.medianHmoGrossYield) {
      signals.estimatedHmoYield = intel.medianHmoGrossYield
    } else {
      missingData.push("area HMO room rent")
    }
  }

  // ── SA revenue ────────────────────────────────────────────────────────
  if (wants(targetStrategies, "SA") || wants(targetStrategies, "R2SA")) {
    if (intel.medianSaMonthlyRevenue) {
      signals.estimatedSaRevenue = intel.medianSaMonthlyRevenue
    } else {
      missingData.push("area SA revenue")
    }
  }

  // ── Strategy signals ──────────────────────────────────────────────────
  const strategySignals: StrategySignal[] = []

  if (wants(targetStrategies, "BTL") && signals.estimatedGrossYield !== null) {
    const y = signals.estimatedGrossYield
    if (y >= 6) {
      strategySignals.push({
        strategy: "BTL",
        signal: "strong",
        reason: `Est. ${y}% gross yield on area rents`,
      })
    } else if (y >= 4.5) {
      strategySignals.push({
        strategy: "BTL",
        signal: "moderate",
        reason: `Est. ${y}% gross yield — near area average`,
      })
    }
  }

  if (wants(targetStrategies, "BRRRR") || wants(targetStrategies, "BRR")) {
    if (signals.bmvPct !== null && signals.bmvPct >= 15 && signals.hasRefurbLanguage) {
      strategySignals.push({
        strategy: "BRRRR",
        signal: "strong",
        reason: `${signals.bmvPct}% below area median + refurb language in listing`,
      })
    } else if (signals.bmvPct !== null && signals.bmvPct >= 10) {
      strategySignals.push({
        strategy: "BRRRR",
        signal: "moderate",
        reason: `${signals.bmvPct}% below area median sale price`,
      })
    } else if (signals.hasRefurbLanguage && signals.bmvPct === null) {
      // Refurb language is real evidence even without a price benchmark —
      // but it's only ever a weak signal on its own.
      strategySignals.push({
        strategy: "BRRRR",
        signal: "weak",
        reason: "Refurb language detected — no area price benchmark to confirm BMV",
      })
    }
  }

  if (wants(targetStrategies, "HMO") && signals.estimatedHmoYield !== null) {
    if (a4Status === "active") {
      // NEVER hide this to make the listing look better.
      strategySignals.push({
        strategy: "HMO",
        signal: "weak",
        reason: "Article 4 in force — HMO conversion needs full planning permission",
      })
    } else if (signals.estimatedHmoYield >= 10) {
      strategySignals.push({
        strategy: "HMO",
        signal: "strong",
        reason:
          `Est. ${signals.estimatedHmoYield}% HMO yield across ${signals.roomPotential} rooms` +
          (a4Status === "none" ? ", no Article 4" : " (Article 4 unconfirmed — verify)"),
      })
    } else if (signals.estimatedHmoYield >= 7) {
      strategySignals.push({
        strategy: "HMO",
        signal: "moderate",
        reason: `Est. ${signals.estimatedHmoYield}% HMO yield`,
      })
    }
  }

  if (
    (wants(targetStrategies, "SA") || wants(targetStrategies, "R2SA")) &&
    signals.estimatedSaRevenue !== null &&
    listing.price > 0
  ) {
    // Compare SA revenue against price as a crude yield proxy.
    const saYield =
      Math.round(((signals.estimatedSaRevenue * 12) / listing.price) * 1000) / 10
    const suitable = listing.propertyType === "flat" || beds <= 3
    if (saYield >= 12 && suitable) {
      strategySignals.push({
        strategy: "SA",
        signal: "strong",
        reason: `Est. ${saYield}% revenue yield, suitable property type`,
      })
    } else if (saYield >= 9) {
      strategySignals.push({
        strategy: "SA",
        signal: "moderate",
        reason: `Est. ${saYield}% revenue yield on area SA data`,
      })
    }
  }

  if (wants(targetStrategies, "FLIP") && signals.bmvPct !== null) {
    if (signals.bmvPct >= 20 && signals.hasRefurbLanguage) {
      strategySignals.push({
        strategy: "FLIP",
        signal: "strong",
        reason: `${signals.bmvPct}% below area median with refurb potential`,
      })
    } else if (signals.bmvPct >= 12) {
      strategySignals.push({
        strategy: "FLIP",
        signal: "moderate",
        reason: `${signals.bmvPct}% below area median`,
      })
    }
  }

  const strongCount = strategySignals.filter((s) => s.signal === "strong").length
  const moderateCount = strategySignals.filter((s) => s.signal === "moderate").length

  return {
    signals,
    score: Math.min(100, strongCount * 30 + moderateCount * 15),
    strategySignals,
    passesThreshold: strongCount >= 1 || moderateCount >= 2,
  }
}
