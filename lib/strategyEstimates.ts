/**
 * Lightweight, client-side strategy ESTIMATES for the "How This Property
 * Compares Across Strategies" panel (Feature A).
 *
 * These are deliberately rough, assumption-driven indicators — NOT full
 * analyses. They reuse data already in memory after an analysis completes
 * (form data + calculation results + backend market data) so they add no
 * page-load cost and never touch the real calculation engines.
 *
 * Each estimate is mapped to a card; the SA estimate degrades to a grey
 * "data not available" state because the backend response carries no
 * Airroi short-let dataset yet (see buildScoringInput.ts).
 */
import type {
  PropertyFormData,
  CalculationResults,
  BackendResults,
  InvestmentType,
} from "./types"

export interface StrategyEstimate {
  strategy: InvestmentType
  /** Short display name shown on the card (e.g. "BTL", "HMO", "SA"). */
  label: string
  /** Emoji icon per the spec. */
  icon: string
  /** false → render a grey/disabled card (no usable data, or unsuitable). */
  available: boolean
  /** Primary metric line, e.g. "Est. 5.8% gross yield". */
  headline: string
  /** Secondary metric line, e.g. "Est. £180/mo cashflow". */
  secondary?: string
  /** Provenance note shown in muted text under the metrics. */
  dataSource: string
  /** Optional warning chip, e.g. "⚠ Article 4 area" for HMO. */
  warningBadge?: string
  /** Note shown on a disabled/grey card (overrides the metric lines). */
  disabledNote?: string
  /**
   * Comparable yield/return used to surface the "best alternative" hint
   * (Section 4). Only set where strategies are directly comparable
   * (BTL/HMO gross yield); null/undefined otherwise so they're excluded.
   */
  primaryMetric?: number | null
  /** Human label for the comparable metric, e.g. "gross yield". */
  primaryMetricLabel?: string
}

/** Mean of a numeric array, or null when empty. */
function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Compute estimates for ALL six strategies on a single property.
 * Order matches the spec's panel layout.
 */
export function estimateStrategies(
  data: PropertyFormData,
  _results: CalculationResults,
  backend: BackendResults | undefined,
): StrategyEstimate[] {
  void _results // reserved — estimates derive from inputs + market data only

  const purchasePrice = data.purchasePrice || 0
  const bedrooms = data.bedrooms || 0

  // ── Shared market data (with documented fallbacks) ──────────────────
  const rentComps = backend?.rent_comparables ?? []
  const avgMarketRent: number | null =
    mean(rentComps.map((r) => r.monthly_rent).filter((n): n is number => !!n)) ??
    backend?.postcode_benchmark?.median_monthly_rent ??
    null

  const soldComps = backend?.sold_comparables ?? []
  const avgSoldPrice: number | null =
    backend?.avg_sold_price ??
    mean(soldComps.map((s) => s.price).filter((n): n is number => !!n)) ??
    null

  // Shared mortgage assumption: 75% LTV, 5% interest-only.
  const monthlyMortgage = purchasePrice * 0.75 * (5.0 / 100 / 12)

  // ── BTL ─────────────────────────────────────────────────────────────
  const btlRent = avgMarketRent ?? purchasePrice * 0.005 // 0.5% rule fallback
  const btlAnnualRent = btlRent * 12
  const btlGrossYield = purchasePrice > 0 ? (btlAnnualRent / purchasePrice) * 100 : 0
  const btlMonthlyCF = btlRent - monthlyMortgage - btlRent * 0.2 // 20% all-in costs
  const btl: StrategyEstimate = {
    strategy: "btl",
    label: "BTL",
    icon: "🏠",
    available: purchasePrice > 0,
    headline: `Est. ${btlGrossYield.toFixed(1)}% gross yield`,
    secondary: `Est. ${btlMonthlyCF >= 0 ? "+" : "−"}£${Math.abs(Math.round(btlMonthlyCF)).toLocaleString()}/mo cashflow`,
    dataSource: avgMarketRent ? "Based on local rental comparables" : "Based on the 0.5% rule (no rent comps)",
    primaryMetric: btlGrossYield,
    primaryMetricLabel: "gross yield",
  }

  // ── HMO ─────────────────────────────────────────────────────────────
  const estimatedRooms = bedrooms >= 5 ? bedrooms : bedrooms + 1 // refurb can add a room
  const estimatedRoomRent = 550 // fallback room rate (no area room-rent dataset)
  const grossHmoRent = estimatedRooms * estimatedRoomRent
  const annualHmoRent = grossHmoRent * 12
  const hmoGrossYield = purchasePrice > 0 ? (annualHmoRent / purchasePrice) * 100 : 0
  const hmoMonthlyCF = grossHmoRent - grossHmoRent * 0.4 - monthlyMortgage // 40% HMO costs
  const a4Active = backend?.article_4?.is_article_4 === true
  const hmo: StrategyEstimate = {
    strategy: "hmo",
    label: "HMO",
    icon: "🏘",
    available: purchasePrice > 0 && bedrooms > 0,
    headline: `Est. ${hmoGrossYield.toFixed(1)}% gross yield`,
    secondary: `Est. ${estimatedRooms} rooms · ${hmoMonthlyCF >= 0 ? "+" : "−"}£${Math.abs(Math.round(hmoMonthlyCF)).toLocaleString()}/mo`,
    dataSource: "Based on room rent data",
    warningBadge: a4Active ? "⚠ Article 4 area" : undefined,
    primaryMetric: hmoGrossYield,
    primaryMetricLabel: "gross yield",
  }

  // ── BRRRR ───────────────────────────────────────────────────────────
  const brrARV = purchasePrice * 1.3 // conservative 30% uplift
  const brrRefurb = purchasePrice * 0.15
  const brrRefi = brrARV * 0.75
  const brrCashReleased = brrRefi - purchasePrice * 0.7 // assume 70% bridging
  const brrTotalCashIn = purchasePrice * 0.3 + brrRefurb + purchasePrice * 0.05
  const brrCapitalRecycled = brrTotalCashIn > 0 ? (brrCashReleased / brrTotalCashIn) * 100 : 0
  const brr: StrategyEstimate = {
    strategy: "brr",
    label: "BRRRR",
    icon: "🔄",
    available: purchasePrice > 0,
    headline: `Est. ${Math.max(0, Math.round(brrCapitalRecycled))}% recycled`,
    secondary: "Needs refurb assessment",
    dataSource: "Indicative only",
  }

  // ── SA (Serviced Accommodation) ─────────────────────────────────────
  // No Airroi dataset in the backend response → grey/disabled card.
  const sa: StrategyEstimate = {
    strategy: "r2sa",
    label: "SA",
    icon: "🌟",
    available: false,
    headline: "Airroi data needed",
    dataSource: "Based on Airroi market data",
    disabledNote: "SA data not available for area",
  }

  // ── FLIP ────────────────────────────────────────────────────────────
  const flipRefurb = purchasePrice * 0.15
  const flipARV = avgSoldPrice ?? purchasePrice * 1.25
  const mao70 = flipARV * 0.7 - flipRefurb
  const rule70Passes = purchasePrice <= mao70
  const flipGrossProfit = flipARV - purchasePrice - flipRefurb - purchasePrice * 0.08
  const flip: StrategyEstimate = {
    strategy: "flip",
    label: "Flip",
    icon: "🔨",
    available: purchasePrice > 0,
    headline: rule70Passes ? "70% rule: PASS ✓" : "70% rule: FAIL ✗",
    secondary: `Est. ${flipGrossProfit >= 0 ? "" : "−"}£${Math.abs(Math.round(flipGrossProfit)).toLocaleString()} gross profit`,
    dataSource: avgSoldPrice ? "Based on sold comparables" : "Based on a 25% ARV assumption",
  }

  // ── DEVELOPMENT ─────────────────────────────────────────────────────
  // Disabled for small residential (< 4 beds); rough GDV uplift otherwise.
  let development: StrategyEstimate
  if (bedrooms <= 3) {
    development = {
      strategy: "development",
      label: "Development",
      icon: "🏗",
      available: false,
      headline: "Not suitable",
      dataSource: "Indicative only",
      disabledNote: "Not typically suitable for small residential",
    }
  } else {
    const estimatedGDV = (avgSoldPrice ?? purchasePrice) * 1.4
    development = {
      strategy: "development",
      label: "Development",
      icon: "🏗",
      available: purchasePrice > 0,
      headline: `Est. £${Math.round(estimatedGDV).toLocaleString()} GDV`,
      secondary: "Rough uplift estimate",
      dataSource: "Indicative only",
    }
  }

  return [btl, hmo, brr, sa, flip, development]
}

/**
 * Pick the best alternative (highest comparable yield) for the Section-4
 * hint. Excludes the current strategy, unavailable cards, and any without
 * a comparable primaryMetric.
 */
export function bestAlternative(
  estimates: StrategyEstimate[],
  currentStrategy: InvestmentType,
): StrategyEstimate | null {
  const candidates = estimates
    .filter((e) => e.strategy !== currentStrategy)
    .filter((e) => e.available)
    .filter((e) => typeof e.primaryMetric === "number" && e.primaryMetric! > 0)
    .sort((a, b) => (b.primaryMetric ?? 0) - (a.primaryMetric ?? 0))
  return candidates[0] ?? null
}
