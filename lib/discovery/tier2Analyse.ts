/**
 * Tier 2 — deep analysis. Runs ONLY on Tier 1 survivors, capped per run.
 *
 * REUSES THE EXISTING ENGINES — no calculation logic is duplicated here:
 *   • calculateAll()      (lib/calculations)     — the same function the
 *                                                  manual analyse form calls
 *   • buildScoringInput() (lib/buildScoringInput)— same adapter
 *   • scoreDeal()         (lib/dealScoring)      — same multi-factor scorer
 *   • checkArticle4()     (lib/article4-service) — same Article 4 engine,
 *                                                  threaded in so HMO scores
 *                                                  carry the real hard cap
 *
 * There is deliberately NO AI call here. The manual flow's Flask
 * /ai-analyze step takes 60-90s per request; at 15 listings × N strategies
 * that would be minutes of runtime and heavy cost per search. Discovery
 * produces the *numbers* (which is what ranking needs); the AI narrative is
 * generated later, on demand, when the user opens a result in the full
 * results page.
 *
 * Because the engines are pure and server-callable (no "use client"), the
 * scores here are the same scores the manual flow would produce from the
 * same inputs.
 */
import { calculateAll } from "@/lib/calculations"
import { buildScoringInput } from "@/lib/buildScoringInput"
import { scoreDeal } from "@/lib/dealScoring"
import type {
  BackendResults,
  InvestmentType,
  PropertyFormData,
} from "@/lib/types"
import type { ListingCandidate } from "./tier1Screen"
import { getDistrictIntel } from "./areaIntel"

/** Discovery strategy label → the engine's InvestmentType. */
const STRATEGY_MAP: Record<string, InvestmentType> = {
  BTL: "btl",
  HMO: "hmo",
  BRRRR: "brr",
  BRR: "brr",
  FLIP: "flip",
  SA: "r2sa",
  R2SA: "r2sa",
  DEV: "development",
  DEVELOPMENT: "development",
}

export interface StrategyOutcome {
  score: number
  label: string
  summary: {
    grossYield: number | null
    netYield: number | null
    monthlyCashflow: number | null
    totalCapitalRequired: number | null
    /** Hard-cap / critical flags from the scorer — never suppressed. */
    criticalFlags: string[]
  }
  /** Inputs the engine had to assume (automated run, not a user's deal). */
  assumptions: string[]
}

export interface Tier2Result {
  strategyResults: Record<string, StrategyOutcome>
  bestStrategy: string
  bestScore: number
}

/**
 * Build the same PropertyFormData shape the manual form submits, using the
 * form's own documented defaults for finance assumptions (this is automated
 * discovery, not a specific user's deal) plus real area data for rents.
 */
function buildFormData(
  listing: ListingCandidate,
  investmentType: InvestmentType,
  area: {
    medianMonthlyRent: number | null
    medianRoomRent: number | null
    medianSaMonthlyRevenue: number | null
    medianSoldPrice: number | null
  },
  assumptions: string[],
): PropertyFormData {
  const beds = listing.bedrooms ?? 3
  const isFlat =
    (listing.propertyType ?? "").toLowerCase().includes("flat") ||
    (listing.propertyType ?? "").toLowerCase().includes("apartment")

  // Rent: area median where we have it, else the 0.5% rule as a clearly
  // labelled fallback so the strategy can still be scored.
  let monthlyRent = area.medianMonthlyRent ?? 0
  if (!monthlyRent) {
    monthlyRent = Math.round(listing.price * 0.005)
    assumptions.push("Rent estimated at 0.5% of price (no area rent data)")
  } else {
    assumptions.push(`Rent from area median (£${monthlyRent}/mo)`)
  }

  // HMO: rooms = beds (+1 below 5, matching the Tier 1 room-potential rule).
  const roomCount = beds >= 5 ? beds : beds + 1
  const avgRoomRate = area.medianRoomRent ?? 0

  // BRRRR/Flip need an ARV. Use the area median sale price when it's above
  // the asking price (a real uplift signal); otherwise assume no uplift and
  // say so, rather than inventing one.
  let arv = 0
  if (area.medianSoldPrice && area.medianSoldPrice > listing.price) {
    arv = area.medianSoldPrice
    assumptions.push(`ARV set to area median sale price (£${arv.toLocaleString()})`)
  } else {
    arv = listing.price
    assumptions.push("No area uplift evidence — ARV assumed equal to asking price")
  }

  assumptions.push("Finance: 25% deposit, 5.5% interest-only (platform defaults)")

  return {
    address: listing.address || "",
    postcode: listing.postcode || "",
    purchasePrice: listing.price,
    propertyType: isFlat ? "flat" : "house",
    investmentType,
    bedrooms: beds,
    condition: "good",
    buyerType: "additional",
    refurbishmentBudget: 0,
    legalFees: 1500,
    surveyCosts: 500,
    purchaseType: "mortgage",
    depositPercentage: 25,
    interestRate: 5.5,
    mortgageTerm: 25,
    mortgageType: "interest-only",
    monthlyRent: investmentType === "hmo" ? roomCount * avgRoomRate : monthlyRent,
    annualRentIncrease: 2,
    voidWeeks: 2,
    managementFeePercent: investmentType === "hmo" ? 15 : 10,
    insurance: investmentType === "hmo" ? 800 : 300,
    maintenance: 500,
    maintenancePercent: 10,
    groundRent: 0,
    bills: investmentType === "hmo" ? 400 : 0,
    // BRRRR / Flip
    arv,
    arvBasis: "comparables",
    brrrExitStrategy: "btl",
    refurbContingencyPercent: 10,
    refurbHoldingMonths: 6,
    refurbHoldingCostPerMonth: 250,
    refinanceLTV: 75,
    refinanceRate: 5.5,
    refinanceTermYears: 25,
    refinanceArrangementFeePercent: 1,
    refinanceValuationFee: 400,
    bridgingLTV: 70,
    bridgingMonthlyRate: 0.75,
    bridgingTermMonths: 12,
    bridgingArrangementFee: 1.0,
    bridgingExitFee: 0.5,
    capitalGrowthRate: 4,
    flipHoldingMonths: 6,
    flipAgentFeePercent: 1.5,
    flipSaleLegalFees: 1500,
    flipMarketingCosts: 500,
    flipSaleMonths: 3,
    flipOwnershipStructure: "individual",
    flipTaxBand: "higher",
    flipCGTAllowanceRemaining: 3000,
    // HMO
    roomCount,
    avgRoomRate,
    hmoLicenceCost: 1000,
    hmoLicenceTermYears: 5,
    // SA
    saOwnershipType: "own",
    saMonthlySARevenue: area.medianSaMonthlyRevenue ?? 0,
    saNightlyRate: 0,
    saOccupancyRate: 65,
    saPlatformFeePercent: 15,
    saCleaningCostPerStay: 80,
    saAvgStaysPerMonth: 8,
    saUtilitiesMonthly: 200,
    saInsuranceAnnual: 800,
    saManagementFeePercent: 20,
    saMaintenancePercent: 5,
    saSetupCosts: 5000,
  } as PropertyFormData
}

export async function runDeepAnalysis(
  listing: ListingCandidate,
  strategies: string[],
): Promise<Tier2Result> {
  // District intel is already memoised from the Tier 1 pass — free here.
  const intel = await getDistrictIntel(listing.postcode || listing.address)

  // Thread the REAL Article 4 result into the scorer so HMO hard caps apply.
  const backend: BackendResults | undefined = intel.article4
    ? ({
        article_4: {
          is_article_4: intel.article4.isArticle4,
          known: intel.article4.status !== "unknown",
          note: intel.article4.summary,
        },
      } as BackendResults)
    : undefined

  const area = {
    medianMonthlyRent: intel.medianMonthlyRent,
    medianRoomRent: intel.medianRoomRent,
    medianSaMonthlyRevenue: intel.medianSaMonthlyRevenue,
    medianSoldPrice: intel.medianSoldPrice,
  }

  const strategyResults: Record<string, StrategyOutcome> = {}

  for (const label of strategies) {
    const key = label.trim().toUpperCase()
    const investmentType = STRATEGY_MAP[key]
    if (!investmentType) continue
    // Development needs a scheme (unit mix, build costs) that discovery
    // can't infer — skip rather than emit a meaningless score.
    if (investmentType === "development") continue

    try {
      const assumptions: string[] = []
      const data = buildFormData(listing, investmentType, area, assumptions)

      // ── The existing engines, unchanged ──────────────────────────────
      const results = calculateAll(data)
      const score = scoreDeal(buildScoringInput(data, results, backend))

      strategyResults[key] = {
        score: score.total,
        label: score.label,
        summary: {
          grossYield: Number.isFinite(results.grossYield) ? results.grossYield : null,
          netYield: Number.isFinite(results.netYield) ? results.netYield : null,
          monthlyCashflow: Number.isFinite(results.monthlyCashFlow)
            ? results.monthlyCashFlow
            : null,
          totalCapitalRequired: Number.isFinite(results.totalCapitalRequired)
            ? results.totalCapitalRequired
            : null,
          // Hard-cap / critical flags are surfaced verbatim — a discovered
          // deal must never look better than the scorer says it is.
          criticalFlags: (score.criticalFlags ?? []).map((f) => f.message),
        },
        assumptions,
      }
    } catch (err) {
      console.warn(
        `[discovery/tier2] ${key} failed for ${listing.listingUrl}:`,
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  const sorted = Object.entries(strategyResults).sort(
    (a, b) => b[1].score - a[1].score,
  )

  return {
    strategyResults,
    bestStrategy: sorted[0]?.[0] ?? strategies[0] ?? "",
    bestScore: sorted[0]?.[1]?.score ?? 0,
  }
}
