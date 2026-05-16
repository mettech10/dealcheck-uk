/**
 * Unified deal-scoring engine.
 *
 * Replaces the per-strategy scorers (Flask `calculate_deal_score`, local
 * `calculateBRRRRDealScore`, `calculateFlipDealScore`, the inline Dev
 * score in `developmentCalculations.ts`). Runs client-side so it has
 * access to the full analysis response — Article 4, benchmarks,
 * comparables, Airroi — alongside the form inputs.
 *
 * Each strategy scores out of 100, built from 4 weighted categories
 * with sub-factors. Hard caps enforce honesty: a deal with Article 4
 * active, a short lease, a runaway SA occupancy assumption, or a
 * non-viable development cannot escape its ceiling regardless of how
 * good the surface metrics look.
 *
 * Public surface: `scoreDeal(input: ScoringInput): ScoreResult`.
 * Per-strategy scorers (`scoreBtl`, `scoreHmo`, …) are also exported
 * for direct testing.
 *
 * See plan-sections 3–8 for the per-strategy rubrics; section 9 for
 * the input contract; section 10 for the UI integration.
 */

// ── Public types ─────────────────────────────────────────────────────

export type StrategyKey = "btl" | "hmo" | "brr" | "flip" | "r2sa" | "development"

export type HmoDemandLevel = "high" | "moderate" | "low" | "unknown"
export type Article4Status = "active" | "proposed" | "none" | "unknown"
export type TenureKey = "freehold" | "leasehold" | "unknown"
export type ConditionKey =
  | "excellent"
  | "good"
  | "cosmetic"
  | "full-refurb"
  | "structural"
  | "unknown"

export interface ScoringInput {
  // ── Strategy ──
  strategy: StrategyKey

  // ── Financial metrics (all strategies share these) ──
  grossYield: number              // %
  netYield: number                // %
  monthlyCashflow: number         // £/mo
  cashOnCashRoi: number           // %
  totalCapitalRequired: number    // £
  purchasePrice: number           // £
  sdlt: number                    // £ paid in SDLT
  mortgageLtv: number             // %

  // ── Property details ──
  tenure: TenureKey
  leaseYearsRemaining?: number    // leasehold only
  bedrooms: number
  condition: ConditionKey
  numberOfRooms?: number          // HMO

  // ── Market data (from API response) ──
  avgSoldPriceArea?: number       // £ (sold comps median)
  soldComparablesCount?: number
  rentalComparablesCount?: number
  areaVoidRate?: number           // %
  areaPriceGrowth5yr?: number     // % pa
  areaGrossYieldMedian?: number   // %
  nationalYieldMedian?: number    // %
  houseValuationEstimate?: number // £ (AVM)

  // ── Article 4 (from article4Engine response) ──
  article4Status: Article4Status

  // ── HMO-specific ──
  hmoRoomDemand?: HmoDemandLevel
  avgRoomRentMarket?: number      // £/mo per room
  userRentPerRoom?: number        // £/mo per room

  // ── BRRRR-specific ──
  capitalRecoveredPct?: number    // %
  cashLeftIn?: number             // £
  arvUpliftMultiple?: number      // (ARV - purchase) / refurbTotal
  arvVsPurchasePct?: number       // %
  bridgingTermMonths?: number
  refinanceLtv?: number           // %
  postRefiCashflow?: number       // £/mo
  yieldOnArv?: number             // %
  roce?: number                   // %

  // ── Flip-specific ──
  netProfit?: number              // £ post-tax
  netRoi?: number                 // %
  profitMarginPct?: number        // % of ARV
  rule70Passes?: boolean
  arvCompsCount?: number
  contingencyPct?: number         // %
  totalCostVsArvPct?: number      // % (totalCost / ARV × 100)
  flipMonths?: number
  flipAreaPriceGrowth?: number    // % pa
  flipSoldComps?: number

  // ── SA / R2SA-specific ──
  monthlyNetProfit?: number       // £
  revenueToCostsRatio?: number    // ratio
  airroiOccupancyAvg?: number     // % market average
  userOccupancyRate?: number      // % user assumption
  airroiNightlyRate?: number      // £ market average
  userNightlyRate?: number        // £
  activeListingsArea?: number
  breakEvenOccupancy?: number     // %
  ownershipType?: "own" | "rent-to-sa" | "rent-to-sa-no-consent"
  platformFeePct?: number         // %
  capitalPaybackMonths?: number   // months
  saArticle4Risk?: "none" | "some" | "active" // 90-night rule etc.

  // ── Development-specific ──
  profitOnGdv?: number            // %
  profitOnCost?: number           // %
  ltgdv?: number                  // %
  ltc?: number                    // %
  roe?: number                    // %
  irr?: number                    // %
  landVsRlvPct?: number           // (landPrice / RLV) × 100
  gdvCompsCount?: number
  planningStatus?:
    | "full-planning"
    | "outline"
    | "pre-application"
    | "no-planning"
    | "permitted-development"
    | "lapsed"
  constructionType?:
    | "new-build-traditional"
    | "new-build-timber-frame"
    | "new-build-modular"
    | "conversion"
    | "extension"
    | "refurbishment"
    | "demolition-and-build"
  devSiteType?:
    | "greenfield"
    | "brownfield"
    | "existing-building"
    | "demolition-and-build"
    | "land-only"
  absorptionMarket?: "active" | "moderate" | "slow" | "unknown"
}

export interface ScoreFactor {
  name: string
  score: number
  maxScore: number
  value: string          // human-readable rendering of the input
  note?: string
}

export interface ScoreCategory {
  name: string
  score: number
  maxScore: number
  factors: ScoreFactor[]
}

export interface CriticalFlag {
  type: string
  message: string
  impact: string
}

export type ScoreColour = "teal" | "green" | "amber" | "orange" | "red"

export interface ScoreResult {
  total: number
  label: string
  colour: ScoreColour
  categories: ScoreCategory[]
  warnings: string[]
  criticalFlags: CriticalFlag[]
}

// ── Helpers ──────────────────────────────────────────────────────────

const fmtPct = (n: number, dp = 1) => `${n.toFixed(dp)}%`
const fmtGbp = (n: number) =>
  n >= 0
    ? `£${Math.round(n).toLocaleString("en-GB")}`
    : `-£${Math.abs(Math.round(n)).toLocaleString("en-GB")}`

/**
 * Tier scorer — picks the points awarded based on which threshold band
 * the value lands in. Bands must be ordered from BEST to WORST.
 * Each band is `[threshold, points]` and matches when value ≥ threshold
 * (or ≤ for inverted scoring — pass `inverted: true`).
 */
function tierScore(
  value: number,
  bands: Array<[number, number]>,
  opts?: { inverted?: boolean },
): number {
  for (const [threshold, points] of bands) {
    if (opts?.inverted ? value <= threshold : value >= threshold) {
      return points
    }
  }
  return 0
}

function bandFromTotal(total: number): { label: string; colour: ScoreColour } {
  if (total >= 85) return { label: "Exceptional", colour: "teal" }
  if (total >= 70) return { label: "Good Deal", colour: "green" }
  if (total >= 55) return { label: "Fair Deal", colour: "amber" }
  if (total >= 40) return { label: "Marginal", colour: "orange" }
  if (total >= 25) return { label: "Weak Deal", colour: "red" }
  return { label: "Poor Deal", colour: "red" }
}

function sumCategories(categories: ScoreCategory[]): number {
  return categories.reduce((s, c) => s + c.score, 0)
}

function clampMax(
  total: number,
  cap: number,
  reason: string,
  warnings: string[],
): number {
  if (total > cap) {
    warnings.push(`Score capped at ${cap} — ${reason}`)
    return cap
  }
  return total
}

// ── Hard-cap logic (Section 10 step 3) ───────────────────────────────

function applyHardCaps(
  total: number,
  input: ScoringInput,
  warnings: string[],
  criticalFlags: CriticalFlag[],
): number {
  let t = total

  // Article 4 + HMO → cap 70
  if (input.strategy === "hmo" && input.article4Status === "active") {
    t = clampMax(t, 70, "Article 4 active in this area", warnings)
    criticalFlags.push({
      type: "article4_hmo",
      message: "⚠ Article 4 Direction In Force",
      impact:
        "HMO conversion requires full planning permission in this area. Planning is NOT guaranteed and adds cost (£500–2,000+), time (8–16 weeks minimum), and risk to this deal. The council may refuse permission if HMO concentration is already high.",
    })
  }

  // Short lease → cap 50 (all strategies on leasehold property)
  if (
    input.tenure === "leasehold" &&
    typeof input.leaseYearsRemaining === "number" &&
    input.leaseYearsRemaining < 70
  ) {
    t = clampMax(t, 50, "Lease under 70 years remaining", warnings)
    criticalFlags.push({
      type: "short_lease",
      message: "⚠ Short Lease — Mortgage Risk",
      impact: `Properties with less than 70 years remaining on the lease are difficult or impossible to mortgage. Most lenders require 70+ years at application, or 85+ years for good rates. You have ${input.leaseYearsRemaining} years remaining. Factor in lease extension costs (£5,000–30,000+) or reconsider.`,
    })
  }

  // SA occupancy overestimate → cap 60
  if (
    input.strategy === "r2sa" &&
    typeof input.userOccupancyRate === "number" &&
    typeof input.airroiOccupancyAvg === "number" &&
    input.airroiOccupancyAvg > 0 &&
    input.userOccupancyRate > input.airroiOccupancyAvg * 1.2
  ) {
    t = clampMax(
      t,
      60,
      "Occupancy assumption > 20% above area market average",
      warnings,
    )
    criticalFlags.push({
      type: "sa_occupancy_risk",
      message: "⚠ Occupancy Assumption Above Market Average",
      impact: `Your assumed occupancy (${input.userOccupancyRate.toFixed(0)}%) is significantly above the Airroi market average for this area (${input.airroiOccupancyAvg.toFixed(0)}%). Most SA investors overestimate occupancy. The deal may not work at realistic occupancy — check break-even occupancy below.`,
    })
  }

  // Negative cashflow (cap 55 if cashflow < -£200)
  if (input.monthlyCashflow < -200) {
    t = clampMax(t, 55, "Monthly cashflow below -£200", warnings)
    criticalFlags.push({
      type: "negative_cashflow",
      message: "⚠ Negative Monthly Cash Flow",
      impact: `This deal costs you ${fmtGbp(Math.abs(input.monthlyCashflow))} per month after all expenses. You will need personal income to fund this shortfall. This is only sustainable if you are confident in capital appreciation.`,
    })
  } else if (input.monthlyCashflow < 0) {
    // Soft warning only — no cap
    criticalFlags.push({
      type: "negative_cashflow",
      message: "⚠ Negative Monthly Cash Flow",
      impact: `This deal costs you ${fmtGbp(Math.abs(input.monthlyCashflow))} per month after all expenses. Manageable, but you'll need to fund the shortfall from personal income.`,
    })
  }

  // Development not viable (cap 40)
  if (
    input.strategy === "development" &&
    typeof input.profitOnGdv === "number" &&
    input.profitOnGdv < 10
  ) {
    t = clampMax(t, 40, "Profit on GDV below 10%", warnings)
    criticalFlags.push({
      type: "dev_not_viable",
      message: "⚠ Scheme Not Viable at Current Inputs",
      impact: `The projected profit on GDV (${fmtPct(input.profitOnGdv)}) is below the minimum industry benchmark of 20%. Lenders will not finance this scheme without improved margins. The land price may need to be renegotiated.`,
    })
  }

  // Development LTGDV too high
  if (
    input.strategy === "development" &&
    typeof input.ltgdv === "number" &&
    input.ltgdv > 70
  ) {
    criticalFlags.push({
      type: "ltgdv_too_high",
      message: "⚠ LTGDV Exceeds Lender Maximum",
      impact: `Your Loan to GDV is ${fmtPct(input.ltgdv)}, above the typical lender maximum of 65–70%. Development finance will be very difficult to secure at this level. Reduce the loan amount or increase the GDV.`,
    })
  }

  // Purchase above market
  if (
    input.avgSoldPriceArea &&
    input.avgSoldPriceArea > 0 &&
    input.purchasePrice > input.avgSoldPriceArea * 1.02
  ) {
    const overpct = ((input.purchasePrice - input.avgSoldPriceArea) /
      input.avgSoldPriceArea) * 100
    criticalFlags.push({
      type: "above_market",
      message: "⚠ Purchase Price Above Comparable Sales",
      impact: `Sold comparables in this area average ${fmtGbp(input.avgSoldPriceArea)}, ${fmtPct(overpct)} below your purchase price of ${fmtGbp(input.purchasePrice)}. You may be overpaying. Negotiate or commission a RICS valuation before proceeding.`,
    })
  }

  return t
}

// ── BTL scorer ───────────────────────────────────────────────────────

export function scoreBtl(input: ScoringInput): ScoreResult {
  const warnings: string[] = []
  const criticalFlags: CriticalFlag[] = []
  const f = (s: number, max: number, name: string, value: string, note?: string): ScoreFactor =>
    ({ name, score: s, maxScore: max, value, note })

  // ── Category 1 — Financial Returns (35) ──
  const gy = tierScore(input.grossYield, [
    [8, 15], [6, 11], [4, 7], [3, 3],
  ])
  const cf = tierScore(input.monthlyCashflow, [
    [300, 12], [150, 9], [0, 5], [-100, 2],
  ])
  const coc = tierScore(input.cashOnCashRoi, [
    [8, 8], [5, 6], [3, 3], [1, 1],
  ])
  const cat1: ScoreCategory = {
    name: "Financial Returns",
    score: gy + cf + coc,
    maxScore: 35,
    factors: [
      f(gy, 15, "Gross Yield", fmtPct(input.grossYield)),
      f(cf, 12, "Monthly Cashflow", fmtGbp(input.monthlyCashflow)),
      f(coc, 8, "Cash-on-Cash ROI", fmtPct(input.cashOnCashRoi)),
    ],
  }

  // ── Category 2 — Market Position (25) ──
  let pvm = 0
  let pvmValue = "No comparables data"
  if (input.avgSoldPriceArea && input.avgSoldPriceArea > 0) {
    const diff = (input.purchasePrice - input.avgSoldPriceArea) / input.avgSoldPriceArea
    if (diff <= -0.2) pvm = 12
    else if (diff <= -0.1) pvm = 9
    else if (diff < 0) pvm = 6
    else if (diff <= 0.02) pvm = 3
    else pvm = 0
    pvmValue = `${fmtPct(diff * 100)} vs area avg ${fmtGbp(input.avgSoldPriceArea)}`
  }

  let demand = 0
  let demandValue = "No data"
  const rentComps = input.rentalComparablesCount ?? 0
  const voidPct = input.areaVoidRate
  if (rentComps >= 10 && (voidPct ?? 100) < 3) {
    demand = 8
    demandValue = `${rentComps} rental comps · void ${fmtPct(voidPct ?? 0)}`
  } else if (rentComps >= 5 || (voidPct !== undefined && voidPct < 5)) {
    demand = 5
    demandValue = `${rentComps} rental comps${
      voidPct !== undefined ? ` · void ${fmtPct(voidPct)}` : ""
    }`
  } else if (rentComps >= 1) {
    demand = 2
    demandValue = `${rentComps} rental comps`
  }

  const growth = tierScore(input.areaPriceGrowth5yr ?? 0, [
    [5, 5], [3, 3], [1, 1],
  ])
  const cat2: ScoreCategory = {
    name: "Market Position",
    score: pvm + demand + growth,
    maxScore: 25,
    factors: [
      f(pvm, 12, "Purchase vs Market", pvmValue),
      f(demand, 8, "Rental Demand", demandValue),
      f(
        growth,
        5,
        "Area Price Growth (5yr)",
        input.areaPriceGrowth5yr !== undefined
          ? `${fmtPct(input.areaPriceGrowth5yr)} pa`
          : "No data",
      ),
    ],
  }

  // ── Category 3 — Risk Factors (25) ──
  const ltv = tierScore(input.mortgageLtv, [
    [65, 8], [75, 5], [80, 2],
  ], { inverted: true })

  let lease = 7
  let leaseValue = "Freehold"
  if (input.tenure === "leasehold") {
    const yrs = input.leaseYearsRemaining ?? 0
    if (yrs >= 125) lease = 6
    else if (yrs >= 85) lease = 4
    else if (yrs >= 70) lease = 1
    else lease = 0
    leaseValue = `Leasehold · ${yrs}yr remaining`
  }

  const condScore: Record<ConditionKey, number> = {
    excellent: 5,
    good: 4,
    cosmetic: 2,
    "full-refurb": 1,
    structural: 0,
    unknown: 2,
  }
  const condPts = condScore[input.condition]
  const condLabel: Record<ConditionKey, string> = {
    excellent: "Excellent / Move-in ready",
    good: "Good — minor cosmetic",
    cosmetic: "Needs cosmetic work",
    "full-refurb": "Needs full refurb",
    structural: "Structural works",
    unknown: "Condition not specified",
  }

  let yieldVsBmk = 0
  let yvbValue = "No benchmark"
  if (input.areaGrossYieldMedian && input.areaGrossYieldMedian > 0) {
    const ratio = input.grossYield / input.areaGrossYieldMedian
    if (ratio >= 1.5) yieldVsBmk = 5
    else if (ratio >= 1.2) yieldVsBmk = 4
    else if (ratio >= 1.0) yieldVsBmk = 3
    else if (ratio >= 0.8) yieldVsBmk = 1
    yvbValue = `${fmtPct(ratio * 100, 0)} of area median (${fmtPct(input.areaGrossYieldMedian)})`
  }

  const cat3: ScoreCategory = {
    name: "Risk Factors",
    score: ltv + lease + condPts + yieldVsBmk,
    maxScore: 25,
    factors: [
      f(ltv, 8, "Mortgage LTV", fmtPct(input.mortgageLtv, 0)),
      f(lease, 7, "Tenure / Lease", leaseValue),
      f(condPts, 5, "Property Condition", condLabel[input.condition]),
      f(yieldVsBmk, 5, "Yield vs Area Benchmark", yvbValue),
    ],
  }

  // ── Category 4 — Deal Fundamentals (15) ──
  const sdltRatio = input.purchasePrice > 0
    ? (input.sdlt / input.purchasePrice) * 100
    : 0
  const sdltPts = tierScore(sdltRatio, [
    [3, 5], [5, 3], [8, 1],
  ], { inverted: true })

  const capitalPts = tierScore(input.totalCapitalRequired, [
    [30000, 5], [60000, 4], [100000, 2], [150000, 1],
  ], { inverted: true })

  let nationalPts = 0
  let nationalValue = "No national benchmark"
  if (input.nationalYieldMedian && input.areaGrossYieldMedian) {
    if (input.areaGrossYieldMedian > input.nationalYieldMedian) nationalPts = 5
    else if (input.areaGrossYieldMedian >= input.nationalYieldMedian * 0.95)
      nationalPts = 3
    else nationalPts = 1
    nationalValue = `Area ${fmtPct(input.areaGrossYieldMedian)} vs Nat. ${fmtPct(input.nationalYieldMedian)}`
  }

  const cat4: ScoreCategory = {
    name: "Deal Fundamentals",
    score: sdltPts + capitalPts + nationalPts,
    maxScore: 15,
    factors: [
      f(sdltPts, 5, "SDLT Efficiency", `${fmtPct(sdltRatio, 1)} of purchase`),
      f(capitalPts, 5, "Capital Required", fmtGbp(input.totalCapitalRequired)),
      f(nationalPts, 5, "Area vs National Yield", nationalValue),
    ],
  }

  const categories = [cat1, cat2, cat3, cat4]
  const rawTotal = sumCategories(categories)
  const total = applyHardCaps(rawTotal, input, warnings, criticalFlags)
  const { label, colour } = bandFromTotal(total)

  return { total, label, colour, categories, warnings, criticalFlags }
}

// ── HMO scorer ───────────────────────────────────────────────────────

export function scoreHmo(input: ScoringInput): ScoreResult {
  const warnings: string[] = []
  const criticalFlags: CriticalFlag[] = []
  const f = (s: number, max: number, name: string, value: string, note?: string): ScoreFactor =>
    ({ name, score: s, maxScore: max, value, note })

  // ── Category 1 — Financial Returns (30) ──
  const gy = tierScore(input.grossYield, [
    [12, 12], [9, 9], [7, 6], [5, 3],
  ])
  const cf = tierScore(input.monthlyCashflow, [
    [600, 10], [400, 8], [200, 5], [0, 2],
  ])
  const coc = tierScore(input.cashOnCashRoi, [
    [12, 8], [8, 6], [5, 3],
  ])
  const cat1: ScoreCategory = {
    name: "Financial Returns",
    score: gy + cf + coc,
    maxScore: 30,
    factors: [
      f(gy, 12, "Gross HMO Yield", fmtPct(input.grossYield)),
      f(cf, 10, "Monthly Cashflow", fmtGbp(input.monthlyCashflow)),
      f(coc, 8, "Cash-on-Cash ROI", fmtPct(input.cashOnCashRoi)),
    ],
  }

  // ── Category 2 — HMO Market Factors (30) ──
  let a4 = 0
  let a4Value = "Status unknown"
  switch (input.article4Status) {
    case "none":
      a4 = 15
      a4Value = "No Article 4 in this area"
      break
    case "proposed":
      a4 = 5
      a4Value = "Article 4 proposed / in consultation"
      break
    case "active":
      a4 = 0
      a4Value = "⚠ Article 4 ACTIVE — see warning"
      break
    case "unknown":
    default:
      a4 = 2
      a4Value = "Article 4 status not confirmed"
  }

  let demand = 2
  let demandValue = "No demand data"
  switch (input.hmoRoomDemand) {
    case "high":
      demand = 8
      demandValue = "HIGH demand"
      break
    case "moderate":
      demand = 5
      demandValue = "MODERATE demand"
      break
    case "low":
      demand = 1
      demandValue = "LOW demand"
      break
  }

  let rentVsMkt = 0
  let rentVsMktValue = "No market average"
  if (input.userRentPerRoom && input.avgRoomRentMarket && input.avgRoomRentMarket > 0) {
    const ratio = input.userRentPerRoom / input.avgRoomRentMarket
    if (ratio >= 1.1) rentVsMkt = 7
    else if (ratio >= 0.9) rentVsMkt = 5
    else if (ratio >= 0.8) rentVsMkt = 2
    else rentVsMkt = 0
    rentVsMktValue = `${fmtGbp(input.userRentPerRoom)}/rm vs market ${fmtGbp(input.avgRoomRentMarket)} (${fmtPct((ratio - 1) * 100, 0)})`
  }

  const cat2: ScoreCategory = {
    name: "HMO Market Factors",
    score: a4 + demand + rentVsMkt,
    maxScore: 30,
    factors: [
      f(a4, 15, "Article 4 Status", a4Value),
      f(demand, 8, "HMO Room Demand", demandValue),
      f(rentVsMkt, 7, "Room Rent vs Market", rentVsMktValue),
    ],
  }

  // ── Category 3 — Risk Factors (25) ──
  const rooms = input.numberOfRooms ?? input.bedrooms
  let licence = 0
  let licenceValue = `${rooms} rooms`
  if (rooms >= 5 && input.article4Status !== "active") {
    licence = 10
    licenceValue = `${rooms} rooms · mandatory licence · no A4`
  } else if (rooms >= 5 && input.article4Status === "active") {
    licence = 2
    licenceValue = `${rooms} rooms · mandatory licence · A4 active`
  } else if (rooms === 4) {
    licence = 7
    licenceValue = `${rooms} rooms · possibly additional licensing tier`
  } else if (rooms === 3) {
    licence = 8
    licenceValue = `${rooms} rooms (C4 — may not need licence)`
  }

  const beds = input.bedrooms
  let suit = 0
  let suitValue = `${beds} bedrooms`
  if (beds >= 5) suit = 8
  else if (beds === 4) suit = 6
  else if (beds === 3) suit = 3

  let ltv = 0
  let ltvValue = `${fmtPct(input.mortgageLtv, 0)}`
  if (input.mortgageLtv <= 65) ltv = 7
  else if (input.mortgageLtv <= 75) ltv = 4

  const cat3: ScoreCategory = {
    name: "Risk Factors",
    score: licence + suit + ltv,
    maxScore: 25,
    factors: [
      f(licence, 10, "HMO Licence Risk", licenceValue),
      f(suit, 8, "Property Suitability", suitValue),
      f(ltv, 7, "Mortgage LTV", ltvValue),
    ],
  }

  // ── Category 4 — Deal Fundamentals (15) ──
  let pvm = 0
  let pvmValue = "No comparables"
  if (input.avgSoldPriceArea && input.avgSoldPriceArea > 0) {
    const diff = (input.purchasePrice - input.avgSoldPriceArea) / input.avgSoldPriceArea
    if (diff <= -0.15) pvm = 8
    else if (diff <= -0.05) pvm = 5
    else if (diff <= 0.02) pvm = 3
    pvmValue = `${fmtPct(diff * 100, 1)} vs area avg`
  }

  let yvb = 0
  let yvbValue = "No benchmark"
  if (input.areaGrossYieldMedian && input.areaGrossYieldMedian > 0) {
    const ratio = input.grossYield / input.areaGrossYieldMedian
    if (ratio >= 2.0) yvb = 7
    else if (ratio >= 1.5) yvb = 5
    else if (ratio >= 1.0) yvb = 3
    yvbValue = `${fmtPct(ratio * 100, 0)} of area median`
  }

  const cat4: ScoreCategory = {
    name: "Deal Fundamentals",
    score: pvm + yvb,
    maxScore: 15,
    factors: [
      f(pvm, 8, "Purchase vs Area Avg", pvmValue),
      f(yvb, 7, "Yield vs Area Benchmark", yvbValue),
    ],
  }

  const categories = [cat1, cat2, cat3, cat4]
  const rawTotal = sumCategories(categories)
  const total = applyHardCaps(rawTotal, input, warnings, criticalFlags)
  const { label, colour } = bandFromTotal(total)

  return { total, label, colour, categories, warnings, criticalFlags }
}

// ── Public entry point ───────────────────────────────────────────────

export function scoreDeal(input: ScoringInput): ScoreResult {
  switch (input.strategy) {
    case "btl":
      return scoreBtl(input)
    case "hmo":
      return scoreHmo(input)
    // brr, flip, r2sa, development scorers added in subsequent sections
    default:
      return {
        total: 0,
        label: "Not Implemented",
        colour: "red",
        categories: [],
        warnings: [`Scorer for strategy "${input.strategy}" not yet implemented`],
        criticalFlags: [],
      }
  }
}
