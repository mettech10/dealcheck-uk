export type PropertyType = "house" | "flat" | "commercial"
export type PropertyTypeDetail =
  | "terraced"
  | "semi-detached"
  | "detached"
  | "end-of-terrace"
  | "flat-apartment"
  | "bungalow"
  | "maisonette"
  | "other"
export type TenureType = "freehold" | "leasehold"
export type InvestmentType = "btl" | "brr" | "hmo" | "flip" | "r2sa" | "development"
export type PropertyCondition = "excellent" | "good" | "cosmetic" | "full-refurb" | "structural"
export type PurchaseType = "mortgage" | "bridging-loan" | "cash"

// ── Property Development (new-build / conversion) ─────────────────────
export type DevSiteType =
  | "greenfield"
  | "brownfield"
  | "existing-building"
  | "demolition-and-build"
  | "land-only"
export type DevPlanningStatus =
  | "no-planning"
  | "pre-application"
  | "outline"
  | "full-planning"
  | "permitted-development"
  | "lapsed"
export type DevConstructionType =
  | "new-build-traditional"
  | "new-build-timber-frame"
  | "new-build-modular"
  | "conversion"
  | "extension"
  | "refurbishment"
export type DevUnitType =
  | "studio"
  | "1-bed-flat"
  | "2-bed-flat"
  | "3-bed-flat"
  | "1-bed-house"
  | "2-bed-house"
  | "3-bed-house"
  | "4-bed-house"
  | "5-bed-house"
  | "commercial"
  | "other"
export type SDLTRateType = "residential" | "non-residential" | "mixed-use"

/** A single unit within a scheme's unit mix. Used to drive GDV + size totals. */
export interface DevUnit {
  unitType: DevUnitType
  numberOfUnits: number       // how many of this type
  avgSizeM2: number           // average GIA per unit (m²)
  salePricePerUnit: number    // £ each — auto-populated by GDV calc, editable
  rentalValuePerUnit?: number // monthly rent per unit — optional (for BTR hybrid)
}

export interface PropertyFormData {
  // Property Details
  address: string
  postcode: string
  purchasePrice: number
  propertyType: PropertyType
  propertyTypeDetail?: PropertyTypeDetail  // granular type (terraced, semi, etc.)
  tenureType?: TenureType                  // freehold or leasehold
  leaseYears?: number                      // years remaining on lease (leasehold only)
  investmentType: InvestmentType
  sqft?: number
  bedrooms: number
  condition: PropertyCondition

  // Purchase Costs
  buyerType: "first-time" | "additional"
  refurbishmentBudget: number
  legalFees: number
  surveyCosts: number

  // Financing
  purchaseType: PurchaseType
  depositPercentage: number
  interestRate: number
  mortgageTerm: number
  mortgageType: "repayment" | "interest-only"
  
  // Bridging Loan (if applicable)
  bridgingLTV?: number // loan-to-value % (typical 65-75%)
  bridgingMonthlyRate?: number // e.g., 0.75 for 0.75% per month
  bridgingTermMonths?: number // typically 3-18 months
  bridgingArrangementFee?: number // % of loan
  bridgingExitFee?: number // % of loan

  // BRR / Flip
  arv?: number // After Repair Value
  arvBasis?: "comparables" | "surveyor" | "agent" | "manual"

  // BRRRR Refurb detail
  refurbContingencyPercent?: number  // typically 10-15% buffer on refurb
  refurbHoldingMonths?: number       // months property is empty during refurb
  refurbHoldingCostPerMonth?: number // insurance + utilities + council tax during void

  // BRRRR Refinance (separate from initial mortgage)
  refinanceLTV?: number             // typically 75%
  refinanceRate?: number            // typical BTL mortgage rate
  refinanceTermYears?: number       // typically 25 years
  refinanceArrangementFeePercent?: number // typically 1-2%
  refinanceValuationFee?: number    // typically £300-500

  // ── Flip-specific ────────────────────────────────────────────────
  // Refurb cost builder — line items sum into refurbishmentBudget.
  // All optional; user can also ignore the builder and enter refurb total directly.
  refurbKitchen?: number
  refurbBathroom?: number
  refurbFlooring?: number
  refurbDecoration?: number
  refurbElectrical?: number
  refurbPlumbing?: number
  refurbExterior?: number
  refurbStructural?: number         // extension / underpinning / major works

  // Flip holding (during works + marketing until completion).
  flipHoldingMonths?: number        // total months held — default 6
  flipCouncilTaxMonthly?: number    // council tax on empty / unoccupied
  flipInsuranceMonthly?: number     // unoccupied property insurance
  flipUtilitiesMonthly?: number     // standing charges + site electric
  flipServiceChargeMonthly?: number // leasehold flats only

  // Flip exit strategy.
  flipAgentFeePercent?: number      // sale estate-agent fee, typical 1-2%
  flipSaleLegalFees?: number        // solicitor on sale (separate from purchase legal)
  flipMarketingCosts?: number       // photos, staging, virtual tour
  flipSaleMonths?: number           // expected time on market + completion (default 3)

  // Flip tax — CGT (individual) or Corporation Tax (Ltd).
  flipOwnershipStructure?: "individual" | "limited-company"
  flipTaxBand?: "basic" | "higher"  // individuals — determines 18% / 24% CGT
  flipCGTAllowanceRemaining?: number // £ of annual CGT allowance unused (cap £3,000 24/25)
  flipCorporationTaxRate?: number   // Ltd co — 19 (small), 25 (main), or marginal
  flipOtherGainsThisYear?: number   // individuals — other taxable gains in same year

  // HMO
  roomCount?: number    // number of lettable rooms
  avgRoomRate?: number  // average monthly rent per room

  // Serviced Accommodation (SA / R2SA)
  saMonthlySARevenue?: number // legacy field (kept for compat)
  saSetupCosts?: number       // one-off setup / furnishing costs
  saOwnershipType?: "own" | "rent-to-sa"
  saNightlyRate?: number      // average nightly rate £
  saOccupancyRate?: number    // expected occupancy % (0-100)
  saPlatformFeePercent?: number // Airbnb/Booking commission %
  saCleaningCostPerStay?: number // cleaning cost per turnover £
  saAvgStaysPerMonth?: number   // average stays/turnovers per month
  saMonthlyLease?: number     // monthly rent/lease if rent-to-SA £
  saUtilitiesMonthly?: number // monthly utilities £
  saInsuranceAnnual?: number  // annual SA insurance £
  saManagementFeePercent?: number // SA management company %
  saMaintenancePercent?: number   // maintenance as % of revenue

  // ── Property Development ──────────────────────────────────────────
  // Site Details
  devSiteType?: DevSiteType
  devSiteAreaM2?: number           // total site area in m² (not just footprint)
  devPlanningStatus?: DevPlanningStatus
  devPlanningRef?: string          // LPA planning reference (e.g. 23/01234/FUL)

  // Unit Mix (dynamic array — zero to many rows)
  devUnitMix?: DevUnit[]

  // Acquisition — SDLT rate type (residential is default; greenfield/land often non-res/mixed)
  sdltRateType?: SDLTRateType

  // Construction
  devConstructionType?: DevConstructionType
  devBuildCostPerM2?: number       // £/m² GIA, auto-suggested from type + location
  devAbnormals?: number            // £ — demolition, contamination, piling, highways, services
  devContingencyPercent?: number   // typical 10% on construction

  // Professional fees (expressed as % of total construction cost)
  devArchitectPercent?: number     // typical 6%
  devStructuralEngineerPercent?: number  // typical 2%
  devQsPercent?: number            // quantity surveyor, typical 1.5%
  devProjectManagerPercent?: number      // typical 2%
  devPlanningConsultantFixed?: number    // £ fixed fee
  devBuildingControlFixed?: number       // £ fixed fee (LPA or approved inspector)
  devWarrantyPercent?: number      // NHBC / Premier Guarantee, typical 1.2% of GDV

  // Planning Obligations
  devCILRatePerM2?: number         // £/m² chargeable area — £0 under LPA threshold
  devS106PerUnit?: number          // £ per dwelling (education, open space)
  devAffordableHousingPercent?: number // 0–50% discount on affordable units
  devBuildingRegsFixed?: number    // £ building regs submission fee

  // Development Finance
  devFinanceLTC?: number           // loan-to-cost %, typical 65%
  devFinanceDay1Percent?: number   // day-1 advance (land + initial fees) as % of LTC
  devFinanceRate?: number          // annual % interest
  devFinanceArrangementFeePercent?: number // typical 2% of facility
  devFinanceMonitoringFeeMonthly?: number  // £/month monitoring fee
  devFinanceTermMonths?: number    // total facility term (typ 12–24)
  devFinanceExitFeePercent?: number // typical 1% of facility
  devFinanceRolledUp?: boolean     // if true, interest accrues not monthly-serviced

  // Exit
  devExitStrategy?: "sell-all" | "hold-and-refinance" | "hybrid"
  devSalesAgentPercent?: number    // typical 1.5% of GDV
  devSalesLegalPerUnit?: number    // £ per unit legal completion
  devMarketingCostsFixed?: number  // £ for the scheme (website, CGI, hoardings)
  devMarketingPerUnit?: number     // £ per unit (brochures, staging)

  // Projections — user-supplied assumptions
  capitalGrowthRate?: number  // annual property appreciation %, default 4

  // Rental Income
  monthlyRent: number
  annualRentIncrease: number
  voidWeeks: number

  // Running Costs
  managementFeePercent: number
  insurance: number
  maintenance: number          // legacy flat annual £ — still used as fallback
  maintenancePercent: number   // preferred: % of annual rent (default 10%)
  groundRent: number
  bills: number
}

export interface CalculationResults {
  // SDLT
  sdltAmount: number
  sdltBreakdown: { band: string; tax: number }[]

  // Total Costs
  totalPurchaseCost: number
  totalCapitalRequired: number
  depositAmount: number
  mortgageAmount: number

  // Mortgage / Bridging Loan
  monthlyMortgagePayment: number
  annualMortgageCost: number
  
  // Bridging Loan Specific (if applicable)
  bridgingLoanDetails?: {
    loanAmount: number
    monthlyInterestRate: number
    termMonths: number
    monthlyInterest: number
    totalInterest: number
    arrangementFee: number
    exitFee: number
    totalCost: number
    totalRepayment: number
    apr: number
  }

  // Yields
  grossYield: number
  netYield: number

  // Cash Flow
  monthlyIncome: number
  monthlyExpenses: number
  monthlyCashFlow: number
  annualCashFlow: number

  // ROI
  cashOnCashReturn: number

  // Running Costs Breakdown
  annualRunningCosts: number
  monthlyRunningCosts: number

  // BRRRR-specific
  refinancedMortgageAmount?: number  // mortgage on ARV after refinance
  moneyLeftInDeal?: number           // total invested minus capital returned at refinance
  equityGained?: number              // ARV - purchase - refurb (forced appreciation)

  // BRRRR — phase cost breakdown
  brrrrAcquisitionCost?: number      // purchase + SDLT + legal + survey
  brrrrRefurbBudget?: number         // user-entered refurb
  brrrrRefurbContingency?: number    // refurb × contingency %
  brrrrRefurbHoldingCost?: number    // months × holding cost/month
  brrrrRefurbTotal?: number          // refurb + contingency + holding
  brrrrBridgingInterest?: number     // total interest over bridging term
  brrrrBridgingFees?: number         // arrangement + exit fees on bridging loan
  brrrrBridgingTotal?: number        // bridging interest + fees
  brrrrRefinanceArrangementFee?: number  // % of new loan
  brrrrRefinanceFees?: number        // arrangement + valuation
  brrrrTotalCashInvested?: number    // sum of all outflows before refinance
  brrrrCapitalReturned?: number      // refinance minus bridging/mortgage payoff
  brrrrCapitalRecycledPct?: number   // capitalReturned / totalCashInvested * 100
  brrrrRefurbUpliftRatio?: number    // (ARV - purchase) / refurbBudget
  brrrrPostRefinanceRate?: number    // echo of refinance rate used

  // Flip-specific (legacy summary — kept for back-compat with existing UI)
  flipGrossProfit?: number           // ARV - purchase - refurb
  flipSellingCosts?: number          // agent fees + selling legal
  flipFinanceCosts?: number          // bridging interest + fees
  flipNetProfit?: number             // pre-tax net: ARV - everything
  flipROI?: number                   // pre-tax ROI: net profit / total capital invested (%)

  // Flip phase breakdown — populated by Section 4 calcs.
  flipAcquisitionCost?: number       // purchase + SDLT + legal + survey
  flipRefurbBudget?: number          // raw refurb (matches refurbishmentBudget)
  flipRefurbContingency?: number     // refurb × contingency %
  flipRefurbTotal?: number           // refurb + contingency
  flipHoldingMonths?: number         // total months held
  flipMonthlyHoldingCost?: number    // council + insurance + utilities + service
  flipHoldingCostsTotal?: number     // monthly × months
  flipAgentFee?: number              // ARV × agent %
  flipMarketingCosts?: number        // echo of form value
  flipExitCostsTotal?: number        // agent + sale legal + marketing
  flipFinanceTotal?: number          // bridging totalCost or mortgage × months

  // Profit + tax
  flipPreTaxProfit?: number          // ARV - all costs (acq + refurb + holding + finance + exit)
  flipTaxType?: "cgt" | "ct"         // which tax regime applies
  flipTaxableGain?: number           // gain after cost base + allowance
  flipTaxLiability?: number          // CGT or CT payable
  flipTaxRateUsed?: number           // 18 / 24 / 19 / 25 etc
  flipPostTaxProfit?: number         // pre-tax - tax
  flipPostTaxROI?: number            // post-tax profit / capital invested (%)
  flipTotalCapitalInvested?: number  // actual cash outlay

  // 70% rule + MAO
  flipSimpleMAO?: number             // ARV × 0.70 - (refurb + contingency)
  flipStrictMAO?: number             // ARV × 0.70 - all non-purchase costs
  flipPassesSimple70?: boolean       // purchase ≤ simple MAO
  flipPassesStrict70?: boolean       // purchase ≤ strict MAO
  flipPercentOfARV?: number          // purchase / ARV (%) — compare to 70

  // Timeline
  flipTotalProjectMonths?: number    // flipHoldingMonths (already includes sale)

  // Deal score
  flipDealScore?: number             // 0-100
  flipDealScoreLabel?: string        // "Excellent" etc.

  // Development-specific — full appraisal (cost stack + finance + profit + RLV)
  // Populated only for investmentType === "development". See
  // lib/developmentCalculations.ts for the DevelopmentResult shape.
  development?: import("./developmentCalculations").DevelopmentResult

  // Projections
  fiveYearProjection: YearProjection[]
}

export interface YearProjection {
  year: number
  propertyValue: number
  equity: number
  annualRent: number
  annualCashFlow: number
  cumulativeCashFlow: number
  totalReturn: number
}

export interface AIAnalysis {
  dealScore: number
  summary: string
  strengths: string[]
  risks: string[]
  recommendation: string
  // New sections for market data
  soldComparables?: SoldComparable[]
  rentComparables?: RentComparable[]
  houseValuation?: HouseValuation
}

export interface SoldComparable {
  address: string
  price: number
  bedrooms: number
  date: string
  type: string
  note?: string
}

export interface RentComparable {
  address: string
  monthlyRent: number
  bedrooms: number
  type: string
  source?: string
}

export interface HouseValuation {
  estimate: number
  confidence: string
  range?: {
    low: number
    high: number
  }
  source?: string
  note?: string
}

// Full structured response from the Flask /ai-analyze endpoint
export interface BackendResults {
  verdict?: "PROCEED" | "REVIEW" | "AVOID"
  deal_score?: number
  deal_score_label?: string
  gross_yield?: number
  net_yield?: number
  monthly_cashflow?: number
  cash_on_cash?: number
  stamp_duty?: number
  deposit_amount?: number
  loan_amount?: number
  monthly_mortgage?: number
  interest_rate?: number
  purchase_price?: number
  address?: string
  postcode?: string
  location?: {
    country?: string
    region?: string
    council?: string
  }
  article_4?: {
    is_article_4: boolean
    known?: boolean
    note?: string
    advice?: string
    hmo_guidance?: string
    social_housing_suggestion?: string
    council?: string
  }
  strategy_recommendations?: {
    BTL?: { suitable: boolean; note: string }
    HMO?: { suitable: boolean; note: string }
    BRR?: { suitable: boolean; note: string }
    FLIP?: { suitable: boolean; note: string }
    SOCIAL_HOUSING?: { suitable: boolean; note: string }
    R2SA?: { suitable: boolean; note: string }
  }
  refurb_estimates?: {
    light?: { total: number; per_sqft_mid?: number; per_sqm?: number }
    medium?: { total: number; per_sqft_mid?: number; per_sqm?: number }
    heavy?: { total: number; per_sqft_mid?: number; per_sqm?: number }
    structural?: { total: number; per_sqft_mid?: number; per_sqm?: number }
  }
  ai_strengths?: string[]
  ai_risks?: string[]
  ai_area?: string
  ai_next_steps?: string[]
  ai_verdict?: string
  sold_comparables?: Array<{
    address: string
    price: number
    bedrooms: number
    date: string
    type: string
    source?: string
  }>
  rent_comparables?: Array<{
    address: string
    monthly_rent: number
    bedrooms?: number
    type?: string
    source?: string
    confidence?: string
  }>
  house_valuation?: {
    estimate: number
    confidence: string
    range?: { low: number; high: number }
    source?: string
    note?: string
  }
  avg_sold_price?: number
  market_source?: string
  risk_flags?: RiskFlag[]
  regional_benchmark?: RegionalBenchmark
  postcode_benchmark?: {
    postcode_district: string
    property_type: string
    bedrooms: number | null
    median_sold_price: number | null
    avg_sold_price: number | null
    transaction_count_12m: number | null
    price_growth_5yr_pct: number | null
    median_monthly_rent: number | null
    lower_quartile_rent: number | null
    upper_quartile_rent: number | null
    gross_yield_median: number | null
    gross_yield_lower: number | null
    gross_yield_upper: number | null
    void_rate_pct: number | null
    data_month: string | null
    _match: string
  }
}

export interface RiskFlag {
  id: string
  name: string
  severity: "HIGH" | "MEDIUM" | "LOW"
  color: "red" | "amber" | "green"
  icon?: string
  description: string
  mitigation: string
}

export interface RegionalBenchmark {
  region_name: string
  postcode_area: string
  data_source: string
  regional_median_yield: number
  your_yield: number
  yield_difference: number
  yield_vs_median_label: string
  yield_percentile: number
  regional_avg_cashflow: number
  your_cashflow: number
  cashflow_difference: number
  cashflow_vs_avg_label: string
  cashflow_percentile: number
  summary: string
}

export interface SensitivityResult {
  // applied slider values
  applied: {
    mortgage_rate: number
    monthly_rent: number
    vacancy_rate: number
  }
  // deal metrics
  deal_score: number
  monthly_cashflow: number
  gross_yield: number
  net_yield: number
  cash_on_cash: number
  verdict: "PROCEED" | "REVIEW" | "AVOID"
  risk_level: string
  risk_flags: RiskFlag[]
  regional_benchmark: RegionalBenchmark
}
