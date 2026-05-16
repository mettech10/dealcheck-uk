/**
 * Adapter: map (form data + calculation results + Flask response) into
 * the unified `ScoringInput` shape consumed by `scoreDeal()`.
 *
 * Keeps the scorer pure — it only knows about the canonical input
 * type — while the messy reality of three separate sources (form,
 * local calc, Flask) is normalised here in one place.
 *
 * Every field is defensively coerced: missing values fall through to
 * undefined, the scorer then handles "no data" branches per its rubric.
 */

import type {
  PropertyFormData,
  CalculationResults,
  BackendResults,
} from "./types"
import type {
  ScoringInput,
  StrategyKey,
  Article4Status,
  HmoDemandLevel,
  TenureKey,
  ConditionKey,
} from "./dealScoring"

function strategyFromInvestmentType(t: string | undefined): StrategyKey {
  switch (t) {
    case "btl":
    case "hmo":
    case "brr":
    case "flip":
    case "r2sa":
    case "development":
      return t
    default:
      return "btl"
  }
}

function tenureFromForm(t: string | undefined): TenureKey {
  if (t === "freehold" || t === "leasehold") return t
  return "unknown"
}

function conditionFromForm(c: string | undefined): ConditionKey {
  switch (c) {
    case "excellent":
    case "good":
    case "cosmetic":
    case "full-refurb":
    case "structural":
      return c
    default:
      return "unknown"
  }
}

/**
 * Article 4 status from the Flask `article_4` block. We trust:
 *   - is_article_4: true → "active"
 *   - is_article_4: false + known: true → "none"
 *   - else → "unknown"
 * (No upstream "proposed" plumbing yet; reserved for future.)
 */
function article4FromBackend(backend: BackendResults | undefined): Article4Status {
  const a4 = backend?.article_4
  if (!a4) return "unknown"
  if (a4.is_article_4 === true) return "active"
  if (a4.is_article_4 === false && a4.known === true) return "none"
  return "unknown"
}

/**
 * HMO demand badge — Flask exposes this through area-analysis-engine
 * Phase 3. Until that lands in the consolidated response we proxy with
 * sold/rent comp counts (high if comps strong; low if sparse).
 */
function hmoDemandFromBackend(
  backend: BackendResults | undefined,
): HmoDemandLevel {
  // Future: backend?.area?.hmo_demand_label
  const rent = backend?.rent_comparables?.length ?? 0
  const sold = backend?.sold_comparables?.length ?? 0
  if (rent >= 10 && sold >= 10) return "high"
  if (rent >= 5 || sold >= 5) return "moderate"
  if (rent >= 1 || sold >= 1) return "low"
  return "unknown"
}

/**
 * SA Article 4 / short-let restrictions — heuristic on postcode prefix
 * until the area-analysis SA dataset is plumbed end-to-end. London
 * (E*, EC, N*, NW, SE, SW, W*, WC) → "some" (90-night rule); Edinburgh
 * (EH) → "active" (Control Zone); else "none".
 */
function saArticle4Risk(postcode: string | undefined):
  | "none" | "some" | "active" {
  const pc = (postcode ?? "").toUpperCase().trim()
  if (!pc) return "none"
  if (pc.startsWith("EH")) return "active"
  const londonPrefixes = ["E", "EC", "N", "NW", "SE", "SW", "W", "WC"]
  for (const p of londonPrefixes) {
    // Only treat the bare prefix + a digit as London (avoid "EN" Enfield etc.)
    const re = new RegExp(`^${p}\\d`)
    if (re.test(pc)) return "some"
  }
  return "none"
}

export function buildScoringInput(
  data: PropertyFormData,
  results: CalculationResults,
  backend: BackendResults | undefined,
): ScoringInput {
  const strategy = strategyFromInvestmentType(data.investmentType)

  // Mortgage LTV: form holds deposit %; LTV = 100 - deposit %.
  // Cash purchases set LTV = 0.
  const mortgageLtv =
    data.purchaseType === "cash"
      ? 0
      : Math.max(0, 100 - (data.depositPercentage ?? 0))

  // Average sold price from comparables OR AVM estimate.
  const avgSold =
    backend?.avg_sold_price ??
    backend?.house_valuation?.estimate ??
    undefined

  // Postcode benchmark fields (Flask returns these via get_benchmark_for_postcode)
  const pb = backend?.postcode_benchmark
  const rb = backend?.regional_benchmark

  // ── Strategy-specific computed values ──

  // BRRRR
  let arvUpliftMultiple: number | undefined
  let arvVsPurchasePct: number | undefined
  let postRefiCashflow: number | undefined
  let yieldOnArv: number | undefined
  let roce: number | undefined
  if (strategy === "brr") {
    arvUpliftMultiple = results.brrrrRefurbUpliftRatio
    if (data.arv && data.purchasePrice > 0) {
      arvVsPurchasePct = ((data.arv - data.purchasePrice) / data.purchasePrice) * 100
    }
    // After refinance the engine already reflects post-refi cashflow in monthlyCashFlow
    postRefiCashflow = results.monthlyCashFlow
    if (data.arv && data.arv > 0) {
      yieldOnArv = (results.monthlyIncome * 12 / data.arv) * 100
    }
    if (results.brrrrTotalCashInvested && results.brrrrCapitalReturned !== undefined) {
      roce =
        results.brrrrTotalCashInvested > 0
          ? (results.brrrrCapitalReturned / results.brrrrTotalCashInvested) * 100
          : 0
    }
  }

  // Flip
  let netProfit: number | undefined
  let netRoi: number | undefined
  let profitMarginPct: number | undefined
  let totalCostVsArvPct: number | undefined
  if (strategy === "flip") {
    netProfit = results.flipPostTaxProfit ?? results.flipNetProfit
    netRoi = results.flipPostTaxROI ?? results.flipROI
    if (data.arv && data.arv > 0 && results.flipPreTaxProfit !== undefined) {
      profitMarginPct = (results.flipPreTaxProfit / data.arv) * 100
    }
    // Total cost = ARV - pretax profit (since pretax profit is ARV - all costs)
    if (
      data.arv &&
      data.arv > 0 &&
      results.flipPreTaxProfit !== undefined
    ) {
      const totalCost = data.arv - results.flipPreTaxProfit
      totalCostVsArvPct = (totalCost / data.arv) * 100
    }
  }

  // SA
  let revenueToCostsRatio: number | undefined
  let breakEvenOccupancy: number | undefined
  let capitalPaybackMonths: number | undefined
  let ownershipType: ScoringInput["ownershipType"]
  if (strategy === "r2sa") {
    if (results.monthlyExpenses > 0) {
      const totalCosts = results.monthlyExpenses + results.monthlyMortgagePayment
      revenueToCostsRatio = totalCosts > 0 ? results.monthlyIncome / totalCosts : 0
    }
    // Break-even occupancy: at what % does monthly revenue = monthly costs?
    if (data.saNightlyRate && data.saNightlyRate > 0) {
      const totalCosts = results.monthlyExpenses + results.monthlyMortgagePayment
      const revenueAt100 = data.saNightlyRate * 30
      if (revenueAt100 > 0) {
        breakEvenOccupancy = (totalCosts / revenueAt100) * 100
      }
    }
    if (results.monthlyCashFlow > 0) {
      capitalPaybackMonths = results.totalCapitalRequired / results.monthlyCashFlow
    }
    // Map ownership type — note "rent-to-sa-no-consent" needs an explicit
    // flag from the user; we don't have one yet, so map "own"/"rent-to-sa"
    // and treat consent as confirmed.
    if (data.saOwnershipType === "own") ownershipType = "own"
    else if (data.saOwnershipType === "rent-to-sa") ownershipType = "rent-to-sa"
  }

  // Development
  let landVsRlvPct: number | undefined
  let absorptionMarket: ScoringInput["absorptionMarket"]
  if (strategy === "development") {
    const dev = results.development
    if (dev && dev.residualLandValue > 0 && dev.acquisitionPrice > 0) {
      landVsRlvPct = (dev.acquisitionPrice / dev.residualLandValue) * 100
    }
    const soldN = backend?.sold_comparables?.length ?? 0
    if (soldN >= 10) absorptionMarket = "active"
    else if (soldN >= 5) absorptionMarket = "moderate"
    else if (soldN >= 1) absorptionMarket = "slow"
    else absorptionMarket = "unknown"
  }

  return {
    strategy,

    // Financial
    grossYield: results.grossYield,
    netYield: results.netYield,
    monthlyCashflow: results.monthlyCashFlow,
    cashOnCashRoi: results.cashOnCashReturn,
    totalCapitalRequired: results.totalCapitalRequired,
    purchasePrice: data.purchasePrice,
    sdlt: results.sdltAmount,
    mortgageLtv,

    // Property
    tenure: tenureFromForm(data.tenureType),
    leaseYearsRemaining: data.leaseYears,
    bedrooms: data.bedrooms,
    condition: conditionFromForm(data.condition),
    numberOfRooms: data.roomCount,

    // Market
    avgSoldPriceArea: avgSold,
    soldComparablesCount: backend?.sold_comparables?.length,
    rentalComparablesCount: backend?.rent_comparables?.length,
    areaVoidRate: pb?.void_rate_pct ?? undefined,
    areaPriceGrowth5yr: pb?.price_growth_5yr_pct ?? undefined,
    areaGrossYieldMedian:
      pb?.gross_yield_median ??
      rb?.regional_median_yield ??
      undefined,
    nationalYieldMedian: undefined, // not currently exposed by backend
    houseValuationEstimate: backend?.house_valuation?.estimate,

    article4Status: article4FromBackend(backend),

    // HMO
    hmoRoomDemand:
      strategy === "hmo" ? hmoDemandFromBackend(backend) : undefined,
    avgRoomRentMarket: undefined, // future: from PropertyData rents-hmo
    userRentPerRoom: data.avgRoomRate,

    // BRRRR
    capitalRecoveredPct: results.brrrrCapitalRecycledPct,
    cashLeftIn: results.moneyLeftInDeal,
    arvUpliftMultiple,
    arvVsPurchasePct,
    bridgingTermMonths: data.bridgingTermMonths,
    refinanceLtv: data.refinanceLTV,
    postRefiCashflow,
    yieldOnArv,
    roce,

    // Flip
    netProfit,
    netRoi,
    profitMarginPct,
    rule70Passes: results.flipPassesStrict70 ?? results.flipPassesSimple70,
    arvCompsCount:
      data.arvBasis === "comparables"
        ? backend?.sold_comparables?.length
        : 0,
    contingencyPct: data.refurbContingencyPercent,
    totalCostVsArvPct,
    flipMonths: results.flipTotalProjectMonths,
    flipAreaPriceGrowth: pb?.price_growth_5yr_pct ?? undefined,
    flipSoldComps: backend?.sold_comparables?.length,

    // SA
    monthlyNetProfit: strategy === "r2sa" ? results.monthlyCashFlow : undefined,
    revenueToCostsRatio,
    airroiOccupancyAvg: undefined, // hooked when airroi block is in BackendResults
    userOccupancyRate: data.saOccupancyRate,
    airroiNightlyRate: undefined,
    userNightlyRate: data.saNightlyRate,
    activeListingsArea: undefined,
    breakEvenOccupancy,
    ownershipType,
    platformFeePct: data.saPlatformFeePercent,
    capitalPaybackMonths,
    saArticle4Risk: strategy === "r2sa" ? saArticle4Risk(data.postcode) : undefined,

    // Development
    profitOnGdv: results.development?.profitOnGDV,
    profitOnCost: results.development?.profitOnCost,
    ltgdv: results.development?.ltgdv,
    ltc: results.development?.ltc,
    roe: results.development?.roe,
    irr: results.development?.irr,
    landVsRlvPct,
    gdvCompsCount: backend?.sold_comparables?.length,
    planningStatus: data.devPlanningStatus,
    constructionType: data.devConstructionType,
    devSiteType: data.devSiteType,
    absorptionMarket,
  }
}
