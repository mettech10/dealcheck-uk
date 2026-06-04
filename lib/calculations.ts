import type { PropertyFormData, CalculationResults, YearProjection, BuyerType } from "./types"

/**
 * Non-residential / mixed-use SDLT bands (England/NI).
 * Applies to pure commercial property, bare land with no dwelling,
 * and mixed-use schemes (residential + commercial in one transaction).
 * No 5% additional-property surcharge applies here, and no FTB relief.
 *   0% up to 150,000
 *   2% on 150,001 – 250,000
 *   5% above 250,000
 */
function calculateNonResidentialSDLT(price: number): {
  total: number
  breakdown: { band: string; tax: number }[]
} {
  const bands = [
    { threshold: 150000, rate: 0, label: "Up to 150,000 (non-res)" },
    { threshold: 250000, rate: 0.02, label: "150,001 - 250,000 (non-res)" },
    { threshold: Infinity, rate: 0.05, label: "Over 250,000 (non-res)" },
  ]
  let remaining = price
  let total = 0
  const breakdown: { band: string; tax: number }[] = []
  let prevThreshold = 0
  for (const band of bands) {
    const taxable = Math.min(remaining, band.threshold - prevThreshold)
    if (taxable <= 0) break
    const tax = taxable * band.rate
    if (tax > 0) breakdown.push({ band: band.label, tax: Math.round(tax) })
    total += tax
    remaining -= taxable
    prevThreshold = band.threshold
  }
  return { total: Math.round(total), breakdown }
}

/**
 * Calculate UK Stamp Duty Land Tax (SDLT) for England/NI
 * Rates effective from April 2025
 *
 * `rateType` selects between the residential bands (default) and the
 * non-residential / mixed-use bands. For Development deals acquiring
 * bare land or mixed-use sites, rateType should be "non-residential"
 * or "mixed-use" — both use the non-residential band set, which
 * typically saves 5-figure sums vs the residential additional-property
 * surcharge on the same purchase price.
 */
export function calculateSDLT(
  price: number,
  buyerType: BuyerType,
  rateType: "residential" | "non-residential" | "mixed-use" = "residential"
): { total: number; breakdown: { band: string; tax: number }[] } {
  // Non-residential / mixed-use: use commercial bands, no FTB relief, no surcharge.
  if (rateType === "non-residential" || rateType === "mixed-use") {
    return calculateNonResidentialSDLT(price)
  }
  // First-time buyer relief: 0% up to £425k, 5% on £425k–£625k, standard above £625k
  // (relief removed entirely if price > £625,000)
  if (buyerType === "first-time" && price <= 625000) {
    const bands = [
      { threshold: 425000, rate: 0, label: "Up to 425,000" },
      { threshold: 625000, rate: 0.05, label: "425,001 - 625,000" },
    ]
    let remaining = price
    let total = 0
    const breakdown: { band: string; tax: number }[] = []
    let prevThreshold = 0
    for (const band of bands) {
      const taxable = Math.min(remaining, band.threshold - prevThreshold)
      if (taxable <= 0) break
      const tax = taxable * band.rate
      if (tax > 0) breakdown.push({ band: band.label, tax: Math.round(tax) })
      total += tax
      remaining -= taxable
      prevThreshold = band.threshold
    }
    return { total: Math.round(total), breakdown }
  }

  // Standard / additional property rates
  const surcharge = buyerType === "additional" ? 0.05 : 0

  const bands = [
    { threshold: 125000, rate: 0, label: "Up to 125,000" },
    { threshold: 250000, rate: 0.02, label: "125,001 - 250,000" },
    { threshold: 925000, rate: 0.05, label: "250,001 - 925,000" },
    { threshold: 1500000, rate: 0.10, label: "925,001 - 1,500,000" },
    { threshold: Infinity, rate: 0.12, label: "Over 1,500,000" },
  ]

  let remaining = price
  let total = 0
  const breakdown: { band: string; tax: number }[] = []
  let prevThreshold = 0

  for (const band of bands) {
    const taxable = Math.min(remaining, band.threshold - prevThreshold)
    if (taxable <= 0) break

    const effectiveRate = band.rate + surcharge
    const tax = taxable * effectiveRate

    if (tax > 0) {
      breakdown.push({
        band: band.label,
        tax: Math.round(tax),
      })
    }

    total += tax
    remaining -= taxable
    prevThreshold = band.threshold
  }

  // If additional property and price > 0, there's always at least the surcharge on the first band
  if (buyerType === "additional" && price > 0 && price <= 125000) {
    const tax = price * surcharge
    total = tax
    breakdown.length = 0
    breakdown.push({ band: "Up to 125,000", tax: Math.round(tax) })
  }

  return { total: Math.round(total), breakdown }
}

/**
 * Calculate monthly mortgage payment
 */
export function calculateMortgagePayment(
  principal: number,
  annualRate: number,
  termYears: number,
  type: "repayment" | "interest-only"
): number {
  if (principal <= 0 || annualRate <= 0) return 0

  const monthlyRate = annualRate / 100 / 12

  if (type === "interest-only") {
    return Math.round(principal * monthlyRate * 100) / 100
  }

  // Repayment mortgage (annuity formula)
  const n = termYears * 12
  const payment =
    (principal * (monthlyRate * Math.pow(1 + monthlyRate, n))) /
    (Math.pow(1 + monthlyRate, n) - 1)

  return Math.round(payment * 100) / 100
}

/**
 * Calculate bridging loan costs
 * Bridging loans typically:
 * - Higher interest (0.5-1.5% per month = 6-18% annual)
 * - Shorter term (3-18 months)
 * - Arrangement fee (1-2% of loan)
 * - Exit fee (0-1% of loan)
 * - Interest rolled up (paid at end) or retained (deducted upfront)
 */
export function calculateBridgingLoan(
  loanAmount: number,
  monthlyRate: number, // e.g., 0.75 for 0.75% per month
  termMonths: number,
  arrangementFeePercent: number = 1,
  exitFeePercent: number = 0.5,
  interestRolledUp: boolean = true
): {
  monthlyInterest: number
  totalInterest: number
  arrangementFee: number
  exitFee: number
  totalCost: number
  totalRepayment: number
  apr: number
} {
  if (loanAmount <= 0 || monthlyRate <= 0) {
    return {
      monthlyInterest: 0,
      totalInterest: 0,
      arrangementFee: 0,
      exitFee: 0,
      totalCost: 0,
      totalRepayment: 0,
      apr: 0
    }
  }

  // Monthly interest charge
  const monthlyInterest = Math.round(loanAmount * (monthlyRate / 100) * 100) / 100
  
  // Total interest over term
  const totalInterest = Math.round(monthlyInterest * termMonths * 100) / 100
  
  // Fees
  const arrangementFee = Math.round(loanAmount * (arrangementFeePercent / 100))
  const exitFee = Math.round(loanAmount * (exitFeePercent / 100))
  
  // Total cost of bridging
  const totalCost = totalInterest + arrangementFee + exitFee
  
  // Total to repay
  const totalRepayment = loanAmount + (interestRolledUp ? totalInterest : 0) + exitFee
  
  // True APR: compound monthly rate → effective annual + fee drag (matches Flask backend)
  const effectiveAnnual = (Math.pow(1 + monthlyRate / 100, 12) - 1) * 100
  const feeDrag = (arrangementFeePercent + exitFeePercent) / Math.max(termMonths / 12, 0.083)
  const apr = Math.round((effectiveAnnual + feeDrag) * 100) / 100
  
  return {
    monthlyInterest,
    totalInterest,
    arrangementFee,
    exitFee,
    totalCost,
    totalRepayment,
    apr
  }
}

/**
 * Calculate gross rental yield
 */
export function calculateGrossYield(annualRent: number, purchasePrice: number): number {
  if (purchasePrice <= 0) return 0
  return Math.round((annualRent / purchasePrice) * 10000) / 100
}

/**
 * Calculate net rental yield
 */
export function calculateNetYield(
  annualRent: number,
  annualCosts: number,
  purchasePrice: number
): number {
  if (purchasePrice <= 0) return 0
  return Math.round(((annualRent - annualCosts) / purchasePrice) * 10000) / 100
}

/**
 * Calculate 5-year projection
 */
function calculateProjection(
  purchasePrice: number,
  annualRent: number,
  annualCashFlow: number,
  mortgageAmount: number,
  capitalGrowthRate: number = 3,
  rentGrowthRate: number = 2
): YearProjection[] {
  const projections: YearProjection[] = []
  let cumulativeCashFlow = 0

  for (let year = 1; year <= 5; year++) {
    const growthMultiplier = Math.pow(1 + capitalGrowthRate / 100, year)
    const rentMultiplier = Math.pow(1 + rentGrowthRate / 100, year)

    const propertyValue = Math.round(purchasePrice * growthMultiplier)
    const equity = propertyValue - mortgageAmount
    const projectedRent = Math.round(annualRent * rentMultiplier)
    const projectedCashFlow = Math.round(annualCashFlow * rentMultiplier)
    cumulativeCashFlow += projectedCashFlow

    projections.push({
      year,
      propertyValue,
      equity,
      annualRent: projectedRent,
      annualCashFlow: projectedCashFlow,
      cumulativeCashFlow,
      totalReturn: equity - (purchasePrice - mortgageAmount) + cumulativeCashFlow,
    })
  }

  return projections
}

/**
 * Run full analysis calculations
 */
export function calculateAll(data: PropertyFormData): CalculationResults {
  // ── Property Development (new-build / conversion / refurb) ──────────────
  // Delegates the full cost-stack + finance + RLV + IRR calc to the
  // dedicated engine and stuffs the result onto CalculationResults.development.
  // We still populate the base CalculationResults fields the shared UI reads
  // (SDLT, TDC, equity, yields=0, no monthly cashflow) so downstream code
  // never has to null-check.
  if (data.investmentType === "development") {
    // Lazy import to avoid a circular (developmentCalculations imports
    // calculateSDLT from this file).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { calculateDevelopment } =
      require("./developmentCalculations") as typeof import("./developmentCalculations")
    const dev = calculateDevelopment(data)
    const { total: sdltAmount, breakdown: sdltBreakdown } = calculateSDLT(
      data.purchasePrice,
      data.buyerType,
      data.sdltRateType ?? "residential",
    )
    return {
      sdltAmount,
      sdltBreakdown,
      totalPurchaseCost: dev.totalDevelopmentCost,
      totalCapitalRequired: dev.equityRequired,
      depositAmount: dev.equityRequired,
      mortgageAmount: dev.financeFacilityLoan,
      monthlyMortgagePayment: 0,
      annualMortgageCost: 0,
      bridgingLoanDetails: undefined,
      grossYield: 0,
      netYield: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlyCashFlow: 0,
      annualCashFlow: 0,
      cashOnCashReturn: dev.roe,
      annualRunningCosts: 0,
      monthlyRunningCosts: 0,
      development: dev,
      fiveYearProjection: [],
    }
  }

  // ── Serviced Accommodation (R2SA or SA-owned) ──────────────────────────
  if (data.investmentType === "r2sa") {
    const isOwned = data.saOwnershipType === "own"
    // Defensive: derive monthly revenue from nightly rate × occupancy × 30 if
    // the form's auto-fill didn't fire (e.g. on direct submit). This avoids
    // the headline metrics collapsing to 0% / "-103% CoC" when the legacy
    // saMonthlySARevenue field is unset but the SA inputs are present.
    const derivedRevenue = (data.saNightlyRate ?? 0) * ((data.saOccupancyRate ?? 0) / 100) * 30
    const saRevenue = (data.saMonthlySARevenue && data.saMonthlySARevenue > 0)
      ? data.saMonthlySARevenue
      : derivedRevenue

    // ── SA Operating Costs (from detailed form fields) ──
    const platformFee     = saRevenue * ((data.saPlatformFeePercent ?? 15) / 100)
    const cleaningCosts   = (data.saCleaningCostPerStay ?? 80) * (data.saAvgStaysPerMonth ?? 8)
    const utilities       = data.saUtilitiesMonthly ?? 200
    const saInsurance     = (data.saInsuranceAnnual ?? 800) / 12
    const saManagement    = saRevenue * ((data.saManagementFeePercent ?? 20) / 100)
    const saMaintenance   = saRevenue * ((data.saMaintenancePercent ?? 5) / 100)

    const monthlyOpCosts = Math.round((platformFee + cleaningCosts + utilities + saInsurance + saManagement + saMaintenance) * 100) / 100

    if (!isOwned) {
      // ── Pure R2SA: rent from landlord, sublet as SA ──
      const rentPaid = data.saMonthlyLease || data.monthlyRent || 0
      const furnitureSetup = data.saSetupCosts || 0
      const cleaningPerStay = data.saCleaningCostPerStay ?? 80
      const annualInsurance = data.saInsuranceAnnual ?? 0
      // Real start-up capital for rent-to-SA: 2-month security deposit +
      // first month's rent in advance + utilities deposit & first month +
      // annual insurance paid upfront + initial cleaning kit (3 stays
      // worth) + furniture/setup. Replaces the old "= setupCosts" stub
      // which understated capital by thousands of pounds.
      const totalCapital = Math.round(
        (rentPaid * 2) +              // security deposit (2 months)
        rentPaid +                    // advance rent (1 month)
        (utilities * 2) +             // utilities deposit + first month
        annualInsurance +             // annual insurance upfront
        (cleaningPerStay * 3) +       // initial cleaning supplies
        furnitureSetup
      )
      const monthlyExpenses = Math.round((rentPaid + monthlyOpCosts) * 100) / 100
      const monthlyCashFlow = Math.round((saRevenue - monthlyExpenses) * 100) / 100
      const annualCashFlow  = Math.round(monthlyCashFlow * 12 * 100) / 100
      const cashOnCashReturn =
        totalCapital > 0 ? Math.round((annualCashFlow / totalCapital) * 10000) / 100 : 0

      return {
        sdltAmount: 0,
        sdltBreakdown: [],
        totalPurchaseCost: 0,
        totalCapitalRequired: totalCapital,
        depositAmount: 0,
        mortgageAmount: 0,
        monthlyMortgagePayment: 0,
        annualMortgageCost: 0,
        bridgingLoanDetails: undefined,
        grossYield: 0,
        netYield: 0,
        monthlyIncome: Math.round(saRevenue * 100) / 100,
        monthlyExpenses,
        monthlyCashFlow,
        annualCashFlow,
        cashOnCashReturn,
        annualRunningCosts: Math.round(monthlyExpenses * 12 * 100) / 100,
        monthlyRunningCosts: monthlyExpenses,
        fiveYearProjection: [],
      }
    }

    // ── SA-Owned: you own the property, run it as SA ──
    const { total: sdltAmount, breakdown: sdltBreakdown } = calculateSDLT(
      data.purchasePrice,
      data.buyerType
    )
    const depositAmount = data.purchaseType === "cash"
      ? data.purchasePrice
      : Math.round(data.purchasePrice * (data.depositPercentage / 100))
    const mortgageAmount = data.purchaseType === "cash" ? 0 : data.purchasePrice - depositAmount
    const setupCosts = data.saSetupCosts || 5000

    const monthlyMortgage = data.purchaseType === "cash"
      ? 0
      : calculateMortgagePayment(mortgageAmount, data.interestRate, data.mortgageTerm, data.mortgageType)

    const totalCapitalRequired = depositAmount + sdltAmount + data.legalFees + data.surveyCosts + data.refurbishmentBudget + setupCosts
    const totalPurchaseCost = data.purchasePrice + sdltAmount + data.legalFees + data.surveyCosts + data.refurbishmentBudget + setupCosts

    const monthlyExpenses = Math.round((monthlyMortgage + monthlyOpCosts) * 100) / 100
    const monthlyCashFlow = Math.round((saRevenue - monthlyExpenses) * 100) / 100
    const annualCashFlow  = Math.round(monthlyCashFlow * 12 * 100) / 100

    const annualSARevenue = saRevenue * 12
    const grossYield = data.purchasePrice > 0
      ? Math.round((annualSARevenue / data.purchasePrice) * 10000) / 100
      : 0
    const netYield = data.purchasePrice > 0
      ? Math.round(((annualSARevenue - monthlyExpenses * 12) / data.purchasePrice) * 10000) / 100
      : 0
    const cashOnCashReturn = totalCapitalRequired > 0
      ? Math.round((annualCashFlow / totalCapitalRequired) * 10000) / 100
      : 0

    const capitalGrowthRate = Math.min(Math.max(data.capitalGrowthRate ?? 4, 0), 30)
    const fiveYearProjection = calculateProjection(
      data.purchasePrice, annualSARevenue, annualCashFlow,
      mortgageAmount, capitalGrowthRate, 2
    )

    return {
      sdltAmount,
      sdltBreakdown,
      totalPurchaseCost,
      totalCapitalRequired,
      depositAmount,
      mortgageAmount,
      monthlyMortgagePayment: monthlyMortgage,
      annualMortgageCost: monthlyMortgage * 12,
      bridgingLoanDetails: undefined,
      grossYield,
      netYield,
      monthlyIncome: Math.round(saRevenue * 100) / 100,
      monthlyExpenses,
      monthlyCashFlow,
      annualCashFlow,
      cashOnCashReturn,
      annualRunningCosts: Math.round(monthlyOpCosts * 12 * 100) / 100,
      monthlyRunningCosts: monthlyOpCosts,
      fiveYearProjection,
    }
  }

  // ── Flip: Buy, refurbish, sell for profit ────────────────────────────
  // 7-phase model: Acquisition → Refurb → Holding → Finance → Exit → Tax → ROI
  if (data.investmentType === "flip") {
    const arv = data.arv || data.purchasePrice // selling price
    const { total: sdltAmount, breakdown: sdltBreakdown } =
      calculateSDLT(data.purchasePrice, data.buyerType)

    // ── Phase 1 — Acquisition ───────────────────────────────────
    const flipAcquisitionCost = Math.round(
      data.purchasePrice + sdltAmount + data.legalFees + data.surveyCosts,
    )

    // ── Phase 2 — Refurb (budget + contingency) ──────────────────
    const contingencyPct = Math.min(
      Math.max(data.refurbContingencyPercent ?? 10, 0),
      50,
    )
    const flipRefurbBudget = Math.round(data.refurbishmentBudget || 0)
    const flipRefurbContingency = Math.round(
      flipRefurbBudget * (contingencyPct / 100),
    )
    const flipRefurbTotal = flipRefurbBudget + flipRefurbContingency

    // ── Phase 3 — Holding costs (during works + sale) ────────────
    const flipHoldingMonths = Math.min(
      Math.max(data.flipHoldingMonths ?? 6, 0),
      36,
    )
    const flipMonthlyHoldingCost = Math.round(
      (data.flipCouncilTaxMonthly ?? 0) +
        (data.flipInsuranceMonthly ?? 0) +
        (data.flipUtilitiesMonthly ?? 0) +
        (data.flipServiceChargeMonthly ?? 0),
    )
    const flipHoldingCostsTotal = Math.round(
      flipMonthlyHoldingCost * flipHoldingMonths,
    )

    // ── Phase 4 — Finance costs over full holding period ─────────
    let flipFinanceTotal = 0
    let bridgingDetails: CalculationResults["bridgingLoanDetails"] = undefined
    const deposit =
      data.purchaseType === "cash"
        ? data.purchasePrice
        : Math.round(data.purchasePrice * (data.depositPercentage / 100))
    const loanAmount =
      data.purchaseType === "cash" ? 0 : data.purchasePrice - deposit

    if (data.purchaseType === "bridging-loan") {
      const bRate = data.bridgingMonthlyRate || 0.75
      // Use flipHoldingMonths over the legacy bridgingTermMonths — the
      // flip form drives the term so numbers stay coherent.
      const bTerm = flipHoldingMonths || data.bridgingTermMonths || 12
      const result = calculateBridgingLoan(
        loanAmount,
        bRate,
        bTerm,
        data.bridgingArrangementFee || 1,
        data.bridgingExitFee || 0.5,
        true,
      )
      flipFinanceTotal = result.totalCost
      bridgingDetails = {
        loanAmount,
        monthlyInterestRate: bRate,
        termMonths: bTerm,
        monthlyInterest: result.monthlyInterest,
        totalInterest: result.totalInterest,
        arrangementFee: result.arrangementFee,
        exitFee: result.exitFee,
        totalCost: result.totalCost,
        totalRepayment: result.totalRepayment,
        apr: result.apr,
      }
    } else if (data.purchaseType === "mortgage") {
      const monthly = calculateMortgagePayment(
        loanAmount,
        data.interestRate,
        data.mortgageTerm,
        data.mortgageType,
      )
      flipFinanceTotal = Math.round(monthly * flipHoldingMonths)
    }

    // ── Phase 5 — Exit costs ─────────────────────────────────────
    const agentPct = Math.max(data.flipAgentFeePercent ?? 1.5, 0)
    const flipAgentFee = Math.round(arv * (agentPct / 100))
    const flipSaleLegal = Math.max(data.flipSaleLegalFees ?? 1500, 0)
    const flipMarketingCosts = Math.max(data.flipMarketingCosts ?? 500, 0)
    const flipExitCostsTotal =
      flipAgentFee + flipSaleLegal + flipMarketingCosts

    // ── Phase 6 — Profit before tax ──────────────────────────────
    const flipGrossProfit = arv - data.purchasePrice - flipRefurbBudget
    const flipPreTaxProfit = Math.round(
      arv -
        flipAcquisitionCost -
        flipRefurbTotal -
        flipHoldingCostsTotal -
        flipFinanceTotal -
        flipExitCostsTotal,
    )

    // ── Phase 7 — Tax (CGT for individual, CT for Ltd) ───────────
    const ownership = data.flipOwnershipStructure ?? "individual"
    let flipTaxType: "cgt" | "ct" = "cgt"
    let flipTaxableGain = 0
    let flipTaxLiability = 0
    let flipTaxRateUsed = 0

    if (ownership === "limited-company") {
      flipTaxType = "ct"
      const ctRate = Math.min(
        Math.max(data.flipCorporationTaxRate ?? 25, 0),
        40,
      )
      flipTaxRateUsed = ctRate
      // Ltd: all costs (including finance interest) are tax-deductible →
      // taxable profit == pre-tax profit.
      flipTaxableGain = Math.max(0, flipPreTaxProfit)
      flipTaxLiability = Math.round(flipTaxableGain * (ctRate / 100))
    } else {
      flipTaxType = "cgt"
      // CGT basis: gain = ARV - allowable cost base. Holding (council tax,
      // utilities, insurance) and finance interest are NOT allowable for
      // CGT (those are revenue-style costs, only relevant if HMRC treats
      // activity as trading income). So we exclude them from cost base.
      const costBase =
        data.purchasePrice +
        sdltAmount +
        data.legalFees +
        data.surveyCosts +
        flipRefurbTotal +
        flipExitCostsTotal
      const rawGain = Math.max(0, arv - costBase)
      const allowance = Math.min(
        Math.max(data.flipCGTAllowanceRemaining ?? 3000, 0),
        3000,
      )
      const otherGains = Math.max(data.flipOtherGainsThisYear ?? 0, 0)
      // Other gains eat into the allowance first.
      const effectiveAllowance = Math.max(0, allowance - otherGains)
      flipTaxableGain = Math.round(Math.max(0, rawGain - effectiveAllowance))
      // 2024/25 residential CGT: basic 18%, higher/additional 24%.
      flipTaxRateUsed = data.flipTaxBand === "basic" ? 18 : 24
      flipTaxLiability = Math.round(flipTaxableGain * (flipTaxRateUsed / 100))
    }

    const flipPostTaxProfit = flipPreTaxProfit - flipTaxLiability

    // ── Phase 8 — Capital invested + ROI ─────────────────────────
    // Cash actually out of the investor's pocket (not borrowed).
    const flipTotalCapitalInvested = Math.round(
      deposit +
        sdltAmount +
        data.legalFees +
        data.surveyCosts +
        flipRefurbTotal +
        flipHoldingCostsTotal +
        flipFinanceTotal +
        flipExitCostsTotal,
    )
    const flipPostTaxROI =
      flipTotalCapitalInvested > 0
        ? Math.round((flipPostTaxProfit / flipTotalCapitalInvested) * 10000) /
          100
        : 0
    const flipROI =
      flipTotalCapitalInvested > 0
        ? Math.round((flipPreTaxProfit / flipTotalCapitalInvested) * 10000) /
          100
        : 0

    // ── Phase 9 — 70% rule & MAO ─────────────────────────────────
    // Simple: max purchase = (ARV × 0.70) - refurb total
    const flipSimpleMAO = Math.round(arv * 0.7 - flipRefurbTotal)
    // Strict: subtract every non-purchase cost so a pass truly means 30% margin.
    const nonPurchaseCosts =
      sdltAmount +
      data.legalFees +
      data.surveyCosts +
      flipRefurbTotal +
      flipHoldingCostsTotal +
      flipFinanceTotal +
      flipExitCostsTotal
    const flipStrictMAO = Math.round(arv * 0.7 - nonPurchaseCosts)
    const flipPassesSimple70 = data.purchasePrice <= flipSimpleMAO
    const flipPassesStrict70 = data.purchasePrice <= flipStrictMAO
    const flipPercentOfARV =
      arv > 0 ? Math.round((data.purchasePrice / arv) * 10000) / 100 : 0

    // ── Phase 10 — Deal score ────────────────────────────────────
    const scoreInput: FlipDealScoreInput = {
      preTaxProfit: flipPreTaxProfit,
      postTaxROI: flipPostTaxROI,
      arv,
      purchasePrice: data.purchasePrice,
      passesSimple70: flipPassesSimple70,
      passesStrict70: flipPassesStrict70,
      refurbBudget: flipRefurbBudget,
      holdingMonths: flipHoldingMonths,
    }
    const score = calculateFlipDealScore(scoreInput)

    // Legacy compat — echo the original flip fields so existing Results UI
    // continues to render while Section 5 builds the new page.
    const sellingCostsLegacy = flipExitCostsTotal

    return {
      sdltAmount,
      sdltBreakdown,
      totalPurchaseCost: flipAcquisitionCost + flipRefurbBudget,
      totalCapitalRequired: flipTotalCapitalInvested,
      depositAmount: deposit,
      mortgageAmount: loanAmount,
      monthlyMortgagePayment: 0,
      annualMortgageCost: 0,
      bridgingLoanDetails: bridgingDetails,
      grossYield: 0,
      netYield: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlyCashFlow: 0,
      // Keep annualCashFlow = post-tax profit so existing BTL-style UI
      // stays numerically correct on Flip dashboards.
      annualCashFlow: flipPostTaxProfit,
      cashOnCashReturn: flipPostTaxROI,
      annualRunningCosts: 0,
      monthlyRunningCosts: 0,
      // Legacy
      flipGrossProfit,
      flipSellingCosts: sellingCostsLegacy,
      flipFinanceCosts: flipFinanceTotal,
      flipNetProfit: flipPreTaxProfit,
      flipROI,
      // New phase breakdown
      flipAcquisitionCost,
      flipRefurbBudget,
      flipRefurbContingency,
      flipRefurbTotal,
      flipHoldingMonths,
      flipMonthlyHoldingCost,
      flipHoldingCostsTotal,
      flipAgentFee,
      flipMarketingCosts,
      flipExitCostsTotal,
      flipFinanceTotal,
      flipPreTaxProfit,
      flipTaxType,
      flipTaxableGain,
      flipTaxLiability,
      flipTaxRateUsed,
      flipPostTaxProfit,
      flipPostTaxROI,
      flipTotalCapitalInvested,
      flipSimpleMAO,
      flipStrictMAO,
      flipPassesSimple70,
      flipPassesStrict70,
      flipPercentOfARV,
      flipTotalProjectMonths: flipHoldingMonths,
      flipDealScore: score.total,
      flipDealScoreLabel: score.label,
      fiveYearProjection: [],
    }
  }

  const { total: sdltAmount, breakdown: sdltBreakdown } = calculateSDLT(
    data.purchasePrice,
    data.buyerType,
    data.sdltRateType
  )

  // Deposit & Mortgage
  const depositAmount =
    data.purchaseType === "cash"
      ? data.purchasePrice
      : Math.round(data.purchasePrice * (data.depositPercentage / 100))

  const mortgageAmount =
    data.purchaseType === "cash" ? 0 : data.purchasePrice - depositAmount

  // Total purchase cost
  const totalPurchaseCost =
    data.purchasePrice +
    sdltAmount +
    data.legalFees +
    data.surveyCosts +
    data.refurbishmentBudget

  // Total capital required (deposit + all costs except the mortgage portion)
  const totalCapitalRequired =
    depositAmount +
    sdltAmount +
    data.legalFees +
    data.surveyCosts +
    data.refurbishmentBudget

  // Mortgage or Bridging Loan calculations
  let monthlyMortgagePayment = 0
  let annualMortgageCost = 0
  let bridgingLoanDetails = undefined

  if (data.purchaseType === "cash") {
    // Cash purchase - no financing costs
    monthlyMortgagePayment = 0
    annualMortgageCost = 0
  } else if (data.purchaseType === "bridging-loan") {
    // Bridging loan calculations
    // Default bridging: 0.75% per month, 12 months, 1% arrangement, 0.5% exit
    const bridgingMonthlyRate = data.bridgingMonthlyRate || 0.75 // 0.75% per month default
    const bridgingTermMonths = data.bridgingTermMonths || 12 // 12 months default
    
    const bridgingResult = calculateBridgingLoan(
      mortgageAmount,
      bridgingMonthlyRate,
      bridgingTermMonths,
      data.bridgingArrangementFee || 1, // 1% default
      data.bridgingExitFee || 0.5, // 0.5% default
      true // interest rolled up
    )
    
    // Map to the correct type format
    bridgingLoanDetails = {
      loanAmount: mortgageAmount,
      monthlyInterestRate: bridgingMonthlyRate,
      termMonths: bridgingTermMonths,
      monthlyInterest: bridgingResult.monthlyInterest,
      totalInterest: bridgingResult.totalInterest,
      arrangementFee: bridgingResult.arrangementFee,
      exitFee: bridgingResult.exitFee,
      totalCost: bridgingResult.totalCost,
      totalRepayment: bridgingResult.totalRepayment,
      apr: bridgingResult.apr
    }
    
    // For cash flow calculations, bridging has no monthly payments
    // (interest is rolled up and paid at exit)
    monthlyMortgagePayment = 0
    annualMortgageCost = 0
  } else {
    // Standard mortgage
    monthlyMortgagePayment = calculateMortgagePayment(
      mortgageAmount,
      data.interestRate,
      data.mortgageTerm,
      data.mortgageType
    )
    annualMortgageCost = monthlyMortgagePayment * 12
  }

  // Rental income
  // - contractAnnualRent: industry-standard rent (no void adjustment) — used for gross yield
  // - annualRent: void-adjusted rent — used for cashflow & net yield
  //
  // HMO note: the form auto-derives data.monthlyRent = roomCount × avgRoomRate,
  // so the standard math here gives correct totals. For HMOs, voidWeeks
  // represents AVERAGE void weeks per room (since whole-property voids are
  // rare in shared houses), and hmoRoomVoidWeeks lets the user override
  // voidWeeks specifically for HMOs without disturbing the BTL field.
  // BRRRR exit strategy — purchase/refurb/refinance phases are identical
  // across exits; only the Phase-4 rental income + running costs branch.
  //   'btl' → single-let (default)        — uses monthlyRent
  //   'hmo' → multi-room HMO              — treated exactly like a standalone HMO
  //   'sa'  → serviced accommodation      — uses nightly rate × occupancy
  const isBrr = data.investmentType === "brr"
  const brrrExit: "btl" | "hmo" | "sa" = isBrr
    ? (data.brrrExitStrategy ?? "btl")
    : "btl"
  const isBrrHmo = isBrr && brrrExit === "hmo"
  const isBrrSa = isBrr && brrrExit === "sa"

  // A BRRRR → HMO exit behaves identically to a standalone HMO for income
  // and running costs (the form auto-derives monthlyRent = rooms × rate).
  const isHMO = data.investmentType === "hmo" || isBrrHmo

  // Serviced-accommodation revenue (only meaningful for the SA exit). Derive
  // from nightly rate × occupancy × 30 if the legacy saMonthlySARevenue
  // field wasn't auto-filled, mirroring the standalone R2SA branch.
  const saDerivedRevenue =
    (data.saNightlyRate ?? 0) * ((data.saOccupancyRate ?? 0) / 100) * 30
  const saRevenue =
    data.saMonthlySARevenue && data.saMonthlySARevenue > 0
      ? data.saMonthlySARevenue
      : saDerivedRevenue

  const effectiveVoidWeeks = isHMO && data.hmoRoomVoidWeeks !== undefined
    ? data.hmoRoomVoidWeeks
    : data.voidWeeks
  const effectiveWeeks = 52 - effectiveVoidWeeks

  // Income — SA exit uses occupancy-baked nightly revenue; everything else
  // (BTL + HMO) uses the void-adjusted monthly rent.
  const contractAnnualRent = isBrrSa
    ? Math.round(saRevenue * 12)
    : data.monthlyRent * 12
  const annualRent = isBrrSa
    ? Math.round(saRevenue * 12) // occupancy already factored into saRevenue
    : Math.round(contractAnnualRent * (effectiveWeeks / 52))
  const monthlyIncome = isBrrSa
    ? Math.round(saRevenue * 100) / 100
    : Math.round((annualRent / 12) * 100) / 100

  // Running costs
  const monthlyManagement = data.monthlyRent * (data.managementFeePercent / 100)
  const monthlyInsurance = data.insurance / 12
  // Maintenance: prefer percentage of GROSS annual rent (matches management
  // fee convention — both expressed as % of contract rent, not the void-
  // adjusted figure); fall back to flat annual amount when % is 0; and if
  // BOTH are 0/unset (can happen when the form's maintenance-mode toggle
  // has zeroed the active field), default to 10% — the industry standard
  // and the form's own default — rather than silently treating maintenance
  // as £0.
  const maintenanceAnnual = data.maintenancePercent > 0
    ? contractAnnualRent * (data.maintenancePercent / 100)
    : data.maintenance > 0
      ? data.maintenance
      : contractAnnualRent * 0.10
  const monthlyMaintenance = maintenanceAnnual / 12
  const monthlyGroundRent = data.groundRent / 12
  const monthlyBills = data.bills // Bills is entered as a monthly figure

  // HMO licence amortisation (one-off council fee spread over licence term).
  // UK HMO licences cost ~£500-£1,500 and are valid 5 years. Spreading the
  // cost across the licence term gives a fair monthly running-cost figure.
  const hmoLicenceTermYears = data.hmoLicenceTermYears && data.hmoLicenceTermYears > 0
    ? data.hmoLicenceTermYears
    : 5
  const hmoLicenceAnnualAmortisation = isHMO && data.hmoLicenceCost
    ? data.hmoLicenceCost / hmoLicenceTermYears
    : 0
  const monthlyHmoLicence = hmoLicenceAnnualAmortisation / 12

  // SA-exit running costs — platform + cleaning + utilities + insurance +
  // SA management + SA maintenance (mirrors the standalone R2SA branch).
  const saMonthlyOpCosts = Math.round(
    (saRevenue * ((data.saPlatformFeePercent ?? 15) / 100) +          // platform commission
      (data.saCleaningCostPerStay ?? 80) * (data.saAvgStaysPerMonth ?? 8) + // cleaning per turnover
      (data.saUtilitiesMonthly ?? 200) +                              // utilities
      (data.saInsuranceAnnual ?? 800) / 12 +                          // SA insurance
      saRevenue * ((data.saManagementFeePercent ?? 20) / 100) +       // SA management
      saRevenue * ((data.saMaintenancePercent ?? 5) / 100)) *         // SA maintenance
      100
  ) / 100

  const monthlyRunningCosts = isBrrSa
    ? saMonthlyOpCosts
    : Math.round(
        (monthlyManagement +
          monthlyInsurance +
          monthlyMaintenance +
          monthlyGroundRent +
          monthlyBills +
          monthlyHmoLicence) *
          100
      ) / 100

  const annualRunningCosts = Math.round(monthlyRunningCosts * 12 * 100) / 100

  // Total monthly expenses
  const monthlyExpenses =
    Math.round((monthlyMortgagePayment + monthlyRunningCosts) * 100) / 100

  // ── BRRRR Refinance Logic ──────────────────────────────────────────────
  // For BRR strategy: 6-phase model — acquisition / refurb / bridging / refinance / capital / metrics
  let refinancedMortgageAmount: number | undefined
  let moneyLeftInDeal: number | undefined
  let equityGained: number | undefined
  let finalMortgageAmount = mortgageAmount
  let finalMonthlyMortgage = monthlyMortgagePayment
  let finalAnnualMortgage = annualMortgageCost
  let finalTotalCapital = totalCapitalRequired

  // BRRRR phase breakdown (undefined for non-BRRRR)
  let brrrrAcquisitionCost: number | undefined
  let brrrrRefurbBudget: number | undefined
  let brrrrRefurbContingency: number | undefined
  let brrrrRefurbHoldingCost: number | undefined
  let brrrrRefurbTotal: number | undefined
  let brrrrBridgingInterest: number | undefined
  let brrrrBridgingFees: number | undefined
  let brrrrBridgingTotal: number | undefined
  let brrrrRefinanceArrangementFee: number | undefined
  let brrrrRefinanceFees: number | undefined
  let brrrrTotalCashInvested: number | undefined
  let brrrrCapitalReturned: number | undefined
  let brrrrCapitalRecycledPct: number | undefined
  let brrrrRefurbUpliftRatio: number | undefined
  let brrrrPostRefinanceRate: number | undefined

  if (data.investmentType === "brr" && data.arv && data.arv > 0) {
    // Phase 3 first — Bridging finance shape (we need bridgingLoanAmount
    // to figure out own-cash portion of the purchase, so compute this
    // BEFORE acquisition cost). Only non-zero when purchaseType is
    // "bridging-loan"; for mortgage/cash BRRRR there's no bridging spend.
    let bridgingLoanAmount = 0
    if (data.purchaseType === "bridging-loan") {
      const bridgingLoanPct = Math.min(Math.max(data.bridgingLTV ?? 70, 0), 100) / 100
      bridgingLoanAmount = data.purchasePrice * bridgingLoanPct
      const monthlyRate = Math.max(data.bridgingMonthlyRate ?? 0, 0) / 100
      const termMonths = Math.max(data.bridgingTermMonths ?? 0, 0)
      const arrFeePct = Math.max(data.bridgingArrangementFee ?? 0, 0) / 100
      const exitFeePct = Math.max(data.bridgingExitFee ?? 0, 0) / 100
      brrrrBridgingInterest = Math.round(bridgingLoanAmount * monthlyRate * termMonths)
      brrrrBridgingFees = Math.round(bridgingLoanAmount * (arrFeePct + exitFeePct))
      brrrrBridgingTotal = brrrrBridgingInterest + brrrrBridgingFees
    } else {
      brrrrBridgingInterest = 0
      brrrrBridgingFees = 0
      brrrrBridgingTotal = 0
    }

    // Phase 1 — Acquisition cost (cash-equivalent upfront before refurb).
    // BUG FIX: when buying with a bridging loan, the investor only puts down
    // the non-bridged portion of the purchase price. Previously the FULL
    // purchase price was counted as own cash, inflating totalCashInvested
    // by the bridging amount and tanking the capital-recycled %.
    // For cash/standard-mortgage purchases, ownCashPurchase = purchasePrice
    // (the deposit is part of cash invested in the BRRRR model — the
    // standard BTL mortgage is never drawn since the property is refinanced
    // straight after refurb).
    const ownCashPurchase = data.purchaseType === "bridging-loan"
      ? data.purchasePrice - bridgingLoanAmount
      : data.purchasePrice
    brrrrAcquisitionCost = Math.round(
      ownCashPurchase + sdltAmount + data.legalFees + data.surveyCosts
    )

    // Phase 2 — Refurb total (budget + contingency + holding during void)
    const contingencyPct = Math.min(Math.max(data.refurbContingencyPercent ?? 10, 0), 50)
    const holdingMonths = Math.min(Math.max(data.refurbHoldingMonths ?? 0, 0), 24)
    const holdingPerMonth = Math.max(data.refurbHoldingCostPerMonth ?? 0, 0)
    brrrrRefurbBudget = Math.round(data.refurbishmentBudget)
    brrrrRefurbContingency = Math.round(brrrrRefurbBudget * (contingencyPct / 100))
    brrrrRefurbHoldingCost = Math.round(holdingMonths * holdingPerMonth)
    brrrrRefurbTotal = brrrrRefurbBudget + brrrrRefurbContingency + brrrrRefurbHoldingCost

    // Phase 4 — Refinance: new BTL mortgage on ARV with dedicated LTV/rate/term
    const refinanceLTVPct = Math.min(Math.max(data.refinanceLTV ?? 75, 0), 100) / 100
    const refinanceRate = Math.max(data.refinanceRate ?? data.interestRate, 0)
    const refinanceTerm = Math.max(data.refinanceTermYears ?? 25, 1)
    const refinanceArrPct = Math.max(data.refinanceArrangementFeePercent ?? 1, 0) / 100
    const refinanceValFee = Math.max(data.refinanceValuationFee ?? 0, 0)
    refinancedMortgageAmount = Math.round(data.arv * refinanceLTVPct)
    brrrrRefinanceArrangementFee = Math.round(refinancedMortgageAmount * refinanceArrPct)
    brrrrRefinanceFees = brrrrRefinanceArrangementFee + Math.round(refinanceValFee)
    brrrrPostRefinanceRate = refinanceRate

    finalMonthlyMortgage = calculateMortgagePayment(
      refinancedMortgageAmount,
      refinanceRate,
      refinanceTerm,
      data.mortgageType
    )
    finalAnnualMortgage = finalMonthlyMortgage * 12
    finalMortgageAmount = refinancedMortgageAmount

    // Phase 5 — Capital flow
    brrrrTotalCashInvested = Math.round(
      brrrrAcquisitionCost +
      brrrrRefurbTotal +
      brrrrBridgingTotal +
      brrrrRefinanceFees
    )
    // Capital returned at refinance = new loan - whatever loan was actually
    // outstanding pre-refinance.
    // BUG FIX: for bridging-loan BRRRR the loan being paid off is the
    // BRIDGING loan, not the standard mortgage (which was never drawn in
    // this scenario). Previously this used `mortgageAmount` (purchase -
    // deposit, computed assuming a standard mortgage), so capitalReturned
    // was off by (bridgingLoan - mortgageAmount). For non-bridging BRRRR
    // (cash or standard mortgage) the original-loan-payoff is the standard
    // mortgageAmount (0 for cash).
    const originalLoanPayoff = data.purchaseType === "bridging-loan"
      ? bridgingLoanAmount
      : mortgageAmount
    brrrrCapitalReturned = Math.max(0, refinancedMortgageAmount - originalLoanPayoff)
    moneyLeftInDeal = Math.max(0, brrrrTotalCashInvested - brrrrCapitalReturned)
    finalTotalCapital = moneyLeftInDeal
    brrrrCapitalRecycledPct = brrrrTotalCashInvested > 0
      ? Math.round((brrrrCapitalReturned / brrrrTotalCashInvested) * 10000) / 100
      : 0

    // Phase 6 — Equity & uplift metrics
    // - equityGained: forced appreciation NET of refurb spend (the investor's
    //   actual created value after paying for the works).
    // - brrrrEquityAtRefinance: equity in the property at refinance time
    //   (ARV − refinanced mortgage). Lender-facing metric; usually larger.
    // - brrrrRefurbUpliftRatio: divides by FULL refurb spend (base + contingency)
    //   so it reflects every £ committed to the works, not just the budgeted £.
    equityGained = Math.round(data.arv - data.purchasePrice - (brrrrRefurbBudget + brrrrRefurbContingency))
    const refurbSpendForRatio = brrrrRefurbBudget + brrrrRefurbContingency
    brrrrRefurbUpliftRatio = refurbSpendForRatio > 0
      ? Math.round(((data.arv - data.purchasePrice) / refurbSpendForRatio) * 100) / 100
      : 0
  }

  // Recalculate expenses & cash flow with final (possibly refinanced) mortgage
  const finalMonthlyExpenses =
    Math.round((finalMonthlyMortgage + monthlyRunningCosts) * 100) / 100
  const finalMonthlyCashFlow = Math.round((monthlyIncome - finalMonthlyExpenses) * 100) / 100
  const finalAnnualCashFlow = Math.round(finalMonthlyCashFlow * 12 * 100) / 100

  // ROI (cash-on-cash return) — for BRRRR, based on money left in deal
  const cashOnCashReturn =
    finalTotalCapital > 0
      ? Math.round((finalAnnualCashFlow / finalTotalCapital) * 10000) / 100
      : 0

  // Yields
  // Gross yield = contract rent / price (no void adjustment) — UK industry convention
  // Net yield = void-adjusted income net of running costs and finance — true return
  const grossYield = calculateGrossYield(contractAnnualRent, data.purchasePrice)
  const netYield = calculateNetYield(
    annualRent,
    annualRunningCosts + finalAnnualMortgage,
    data.purchasePrice
  )

  // 5-year projection — use user-supplied capitalGrowthRate (default 4%, clamped 0–30%)
  const capitalGrowthRate = Math.min(Math.max(data.capitalGrowthRate ?? 4, 0), 30)
  const fiveYearProjection = calculateProjection(
    data.investmentType === "brr" && data.arv ? data.arv : data.purchasePrice,
    annualRent,
    finalAnnualCashFlow,
    finalMortgageAmount,
    capitalGrowthRate,
    data.annualRentIncrease
  )

  // HMO-specific result fields (only populated when investmentType === "hmo")
  const hmoResults = isHMO
    ? {
        hmoTotalRooms: data.roomCount || 0,
        hmoAvgRoomRate: data.avgRoomRate || 0,
        hmoContractRentMonthly: (data.roomCount || 0) * (data.avgRoomRate || 0),
        hmoEffectiveRentMonthly: Math.round(monthlyIncome * 100) / 100,
        hmoOccupancyRate: Math.round((effectiveWeeks / 52) * 10000) / 100,
        hmoLicenceCost: data.hmoLicenceCost || 0,
        hmoLicenceTermYears,
        hmoLicenceAnnualAmortisation: Math.round(hmoLicenceAnnualAmortisation * 100) / 100,
        // Yield per room: annual room rent / (price share per room) × 100.
        // Useful for benchmarking against HMO market norms (typically 8-15%).
        hmoYieldPerRoom:
          data.roomCount && data.roomCount > 0 && data.purchasePrice > 0
            ? Math.round(
                (((data.avgRoomRate || 0) * 12) /
                  (data.purchasePrice / data.roomCount)) *
                  10000
              ) / 100
            : 0,
      }
    : {}

  return {
    sdltAmount,
    sdltBreakdown,
    totalPurchaseCost,
    totalCapitalRequired: finalTotalCapital,
    depositAmount,
    mortgageAmount: finalMortgageAmount,
    monthlyMortgagePayment: finalMonthlyMortgage,
    annualMortgageCost: finalAnnualMortgage,
    bridgingLoanDetails,
    grossYield,
    netYield,
    monthlyIncome,
    monthlyExpenses: finalMonthlyExpenses,
    monthlyCashFlow: finalMonthlyCashFlow,
    annualCashFlow: finalAnnualCashFlow,
    cashOnCashReturn,
    annualRunningCosts,
    monthlyRunningCosts,
    refinancedMortgageAmount,
    moneyLeftInDeal,
    equityGained,
    brrrrEquityAtRefinance:
      data.investmentType === "brr" && data.arv && refinancedMortgageAmount
        ? Math.round(data.arv - refinancedMortgageAmount)
        : undefined,
    brrrrAcquisitionCost,
    brrrrRefurbBudget,
    brrrrRefurbContingency,
    brrrrRefurbHoldingCost,
    brrrrRefurbTotal,
    brrrrBridgingInterest,
    brrrrBridgingFees,
    brrrrBridgingTotal,
    brrrrRefinanceArrangementFee,
    brrrrRefinanceFees,
    brrrrTotalCashInvested,
    brrrrCapitalReturned,
    brrrrCapitalRecycledPct,
    brrrrRefurbUpliftRatio,
    brrrrPostRefinanceRate,
    ...hmoResults,
    fiveYearProjection,
  }
}

/**
 * Format number as GBP currency
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Format as percentage
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

/**
 * Calculate deal score from cash-on-cash ROI (%).
 *
 * Bands (linear interpolation within each):
 *   ROI ≥ 20%        → 100
 *   15% ≤ ROI < 20%  → 75 – 100
 *   10% ≤ ROI < 15%  → 50 – 75
 *   5%  ≤ ROI < 10%  → 25 – 50
 *   0%  ≤ ROI < 5%   → 0  – 25
 *   ROI < 0%         → 0
 */
export function calculateDealScore(cashOnCashReturn: number): number {
  if (cashOnCashReturn >= 20) return 100
  if (cashOnCashReturn >= 15) return Math.round(75 + ((cashOnCashReturn - 15) / 5) * 25)
  if (cashOnCashReturn >= 10) return Math.round(50 + ((cashOnCashReturn - 10) / 5) * 25)
  if (cashOnCashReturn >= 5)  return Math.round(25 + ((cashOnCashReturn - 5)  / 5) * 25)
  if (cashOnCashReturn >= 0)  return Math.round((cashOnCashReturn / 5) * 25)
  return 0
}

/**
 * BRRRR-specific deal score (0-100) built from 5 weighted axes:
 *
 *   Capital Recycling  (30 pts) — % of cash pulled back at refinance
 *   Cashflow           (25 pts) — monthly cashflow post-refinance
 *   Refurb Uplift      (20 pts) — (ARV - purchase) / refurb budget
 *   Net Yield on ARV   (15 pts) — post-refinance yield vs target
 *   ROCE               (10 pts) — annual cashflow / money left in deal
 *
 * Returns the total score plus a per-axis breakdown so the UI can render
 * a radar/bar chart, and a qualitative label ("Excellent" ... "Poor").
 */
export interface BRRRRDealScore {
  total: number
  label: "Excellent" | "Strong" | "Decent" | "Marginal" | "Poor"
  breakdown: {
    capitalRecycling: { score: number; max: 30; value: number; note: string }
    cashflow:         { score: number; max: 25; value: number; note: string }
    refurbUplift:     { score: number; max: 20; value: number; note: string }
    yieldOnARV:       { score: number; max: 15; value: number; note: string }
    roce:             { score: number; max: 10; value: number; note: string }
  }
}

export function calculateBRRRRDealScore(
  results: CalculationResults,
  arv?: number,
  data?: {
    monthlyRent?: number
    purchasePrice?: number
    // BRRRR exit strategy — changes the yield axis benchmark + adds an SA
    // occupancy-realism penalty. Defaults to single-let BTL.
    exit?: "btl" | "hmo" | "sa"
    occupancyRate?: number
  }
): BRRRRDealScore {
  const exit = data?.exit ?? "btl"
  // BRRRR scoring rubric — stepped bands by industry convention.
  // Steps match the canonical BRRRR investor framework: capital recycled
  // >= 80-90% is the gold standard, refurb uplift >= 2× is exceptional,
  // post-refi cashflow >= £500/mo is strong, etc.

  // ── Axis 1: Capital recycling (30 pts) ──────────────────────────────
  //   >= 90% → 30   |   >= 75% → 22   |   >= 50% → 15
  //   >= 25% →  8   |   else  →  0
  const recycledPct = results.brrrrCapitalRecycledPct ?? 0
  let capitalRecyclingScore: number
  if (recycledPct >= 90)      capitalRecyclingScore = 30
  else if (recycledPct >= 75) capitalRecyclingScore = 22
  else if (recycledPct >= 50) capitalRecyclingScore = 15
  else if (recycledPct >= 25) capitalRecyclingScore = 8
  else                        capitalRecyclingScore = 0

  // ── Axis 2: Post-refi monthly cashflow (25 pts) ─────────────────────
  //   >= £500 → 25  |  >= £300 → 18  |  >= £100 → 10
  //   >= £0   →  5  |  < £0    →  0
  const mcf = results.monthlyCashFlow ?? 0
  let cashflowScore: number
  if (mcf >= 500)      cashflowScore = 25
  else if (mcf >= 300) cashflowScore = 18
  else if (mcf >= 100) cashflowScore = 10
  else if (mcf >= 0)   cashflowScore = 5
  else                 cashflowScore = 0

  // ── Axis 3: Refurb uplift multiple (20 pts) ─────────────────────────
  // ratio = (ARV - purchase) / (refurb budget + contingency).
  //   >= 2.0× → 20  |  >= 1.5× → 14  |  >= 1.0× →  8
  //   < 1.0×  →  0
  const uplift = results.brrrrRefurbUpliftRatio ?? 0
  let upliftScore: number
  if (uplift >= 2.0)      upliftScore = 20
  else if (uplift >= 1.5) upliftScore = 14
  else if (uplift >= 1.0) upliftScore = 8
  else                    upliftScore = 0

  // ── Axis 4: Rental return on ARV (15 pts) — exit-aware ──────────────
  // The income benchmark depends on how the property is rented AFTER
  // refinancing:
  //   BTL → gross yield on ARV (single-let rent). 8/6/4% bands.
  //   HMO → gross yield on ARV (room income is far higher), so we hold
  //         it to a higher bar: 12/9/6% bands.
  //   SA  → yield is not the right lens (revenue is gross of heavy opex);
  //         we score on post-refi MONTHLY PROFIT instead: 500/300/100/0.
  // Uses ARV (not purchase) because refinance debt scales with ARV.
  // `results.monthlyIncome` already reflects the chosen exit's gross
  // income (single rent / room income / SA revenue) from calculateAll.
  const grossMonthlyIncome = results.monthlyIncome ?? data?.monthlyRent ?? 0
  const annualGrossRent = grossMonthlyIncome * 12
  const yieldOnARV =
    arv && arv > 0 ? (annualGrossRent / arv) * 100 : 0
  let yieldScore: number
  let yieldNote: string
  if (exit === "sa") {
    // Score Axis 4 on post-refi monthly net profit for SA.
    if (mcf >= 500)      yieldScore = 15
    else if (mcf >= 300) yieldScore = 10
    else if (mcf >= 100) yieldScore = 5
    else                 yieldScore = 0
    yieldNote = `£${Math.round(mcf)}/mo SA net profit (post-refi)`
  } else if (exit === "hmo") {
    if (yieldOnARV >= 12)     yieldScore = 15
    else if (yieldOnARV >= 9) yieldScore = 10
    else if (yieldOnARV >= 6) yieldScore = 5
    else                      yieldScore = 0
    yieldNote = `${yieldOnARV.toFixed(2)}% HMO gross yield on ARV`
  } else {
    if (yieldOnARV >= 8)      yieldScore = 15
    else if (yieldOnARV >= 6) yieldScore = 10
    else if (yieldOnARV >= 4) yieldScore = 5
    else                      yieldScore = 0
    yieldNote = `${yieldOnARV.toFixed(2)}% gross yield on ARV`
  }

  // ── Axis 5: ROCE — Return on Capital Employed (10 pts) ──────────────
  // ROCE = forced equity uplift / money still in deal × 100.
  // This is the WEALTH-creation metric — how much equity you built per
  // £ of cash still locked in. Distinct from cash-on-cash (income/cash).
  //   moneyLeft <= 0      → 10 (perfect recycle — infinite ROCE)
  //   ROCE >= 200%        → 10
  //   ROCE 100-200%       →  7
  //   ROCE  50-100%       →  4
  //   ROCE  <  50%        →  0
  const moneyLeft = results.moneyLeftInDeal ?? results.totalCapitalRequired ?? 0
  const valueUplift =
    arv && data?.purchasePrice ? arv - data.purchasePrice : 0
  const roceValue = moneyLeft > 500
    ? (valueUplift / moneyLeft) * 100
    : 999
  let roceScore: number
  if (moneyLeft <= 500)      roceScore = 10
  else if (roceValue >= 200) roceScore = 10
  else if (roceValue >= 100) roceScore = 7
  else if (roceValue >= 50)  roceScore = 4
  else                       roceScore = 0

  // SA occupancy-realism penalty: an SA exit underwritten on an
  // optimistic occupancy assumption (> 80%) is fragile — apply a -10
  // haircut so over-rosy SA deals can't inflate their way to "Strong".
  const occupancy = data?.occupancyRate ?? 0
  const saOccupancyPenalty =
    exit === "sa" && occupancy > 80 ? 10 : 0

  const total =
    capitalRecyclingScore + cashflowScore + upliftScore + yieldScore + roceScore -
    saOccupancyPenalty

  const label: BRRRRDealScore["label"] =
    total >= 90 ? "Excellent" :
    total >= 75 ? "Strong"    :
    total >= 60 ? "Decent"    :
    total >= 45 ? "Marginal"  :
                  "Poor"

  return {
    total: Math.min(100, Math.max(0, total)),
    label,
    breakdown: {
      capitalRecycling: {
        score: capitalRecyclingScore, max: 30, value: recycledPct,
        note: `${recycledPct.toFixed(1)}% of cash recycled`,
      },
      cashflow: {
        score: cashflowScore, max: 25, value: mcf,
        note: `£${Math.round(mcf)}/mo post-refinance`,
      },
      refurbUplift: {
        score: upliftScore, max: 20, value: uplift,
        note: `${uplift.toFixed(2)}× uplift on refurb`,
      },
      yieldOnARV: {
        score: yieldScore, max: 15, value: exit === "sa" ? mcf : yieldOnARV,
        note: yieldNote,
      },
      roce: {
        score: roceScore, max: 10,
        value: moneyLeft <= 500 ? 100 : roceValue,
        note: moneyLeft <= 500
          ? "Perfect capital recycle"
          : `${roceValue.toFixed(1)}% wealth uplift on money left`,
      },
    },
  }
}

/**
 * Flip-specific deal score (0-100) across 5 weighted axes:
 *
 *   Profit Margin      (25 pts) — pre-tax profit / ARV (target 20-25%)
 *   Post-tax ROI       (25 pts) — cash-on-cash after tax
 *   70% Rule           (20 pts) — strict pass = full, simple pass = half
 *   Refurb Uplift      (15 pts) — (ARV - purchase) / refurb
 *   Timeline Risk      (15 pts) — shorter project = lower risk
 *
 * Short label for the UI: Excellent / Strong / Decent / Marginal / Poor.
 */
export interface FlipDealScoreInput {
  preTaxProfit: number
  postTaxROI: number
  arv: number
  purchasePrice: number
  passesSimple70: boolean
  passesStrict70: boolean
  refurbBudget: number
  holdingMonths: number
}

export interface FlipDealScore {
  total: number
  label: "Excellent" | "Strong" | "Decent" | "Marginal" | "Poor"
  breakdown: {
    profitMargin:  { score: number; max: 25; value: number; note: string }
    postTaxROI:    { score: number; max: 25; value: number; note: string }
    seventyRule:   { score: number; max: 20; value: number; note: string }
    refurbUplift:  { score: number; max: 15; value: number; note: string }
    timelineRisk:  { score: number; max: 15; value: number; note: string }
  }
}

export function calculateFlipDealScore(
  input: FlipDealScoreInput,
): FlipDealScore {
  // ── Axis 1 — Profit margin vs ARV (25 pts) ──────────────────────────
  //   ≥ 25%    → 25
  //   20-25%   → 18-25
  //   15-20%   → 12-18
  //   10-15%   →  6-12
  //   5-10%    →  2-6
  //   0-5%     →  0-2
  const margin =
    input.arv > 0 ? (input.preTaxProfit / input.arv) * 100 : 0
  let marginScore: number
  if (margin >= 25)      marginScore = 25
  else if (margin >= 20) marginScore = Math.round(18 + ((margin - 20) / 5) * 7)
  else if (margin >= 15) marginScore = Math.round(12 + ((margin - 15) / 5) * 6)
  else if (margin >= 10) marginScore = Math.round(6  + ((margin - 10) / 5) * 6)
  else if (margin >= 5)  marginScore = Math.round(2  + ((margin - 5)  / 5) * 4)
  else if (margin >= 0)  marginScore = Math.round((margin / 5) * 2)
  else                   marginScore = 0

  // ── Axis 2 — Post-tax ROI (25 pts) ─────────────────────────────────
  //   ≥ 30%    → 25
  //   20-30%   → 18-25
  //   15-20%   → 12-18
  //   10-15%   →  6-12
  //   5-10%    →  2-6
  //   < 5%     →  0-2
  const roi = input.postTaxROI
  let roiScore: number
  if (roi >= 30)      roiScore = 25
  else if (roi >= 20) roiScore = Math.round(18 + ((roi - 20) / 10) * 7)
  else if (roi >= 15) roiScore = Math.round(12 + ((roi - 15) / 5)  * 6)
  else if (roi >= 10) roiScore = Math.round(6  + ((roi - 10) / 5)  * 6)
  else if (roi >= 5)  roiScore = Math.round(2  + ((roi - 5)  / 5)  * 4)
  else if (roi >= 0)  roiScore = Math.round((roi / 5) * 2)
  else                roiScore = 0

  // ── Axis 3 — 70% rule (20 pts) ─────────────────────────────────────
  // Strict pass (purchase ≤ ARV×0.7 - ALL non-purchase costs) = full 20.
  // Simple pass only (purchase ≤ ARV×0.7 - refurb) = 10.
  // Fails both = 0.
  const seventyScore = input.passesStrict70
    ? 20
    : input.passesSimple70
      ? 10
      : 0
  const seventyValue = input.passesStrict70 ? 1 : input.passesSimple70 ? 0.5 : 0

  // ── Axis 4 — Refurb uplift (15 pts) ────────────────────────────────
  // (ARV - purchase) / refurbBudget
  //   ≥ 2.5x   → 15
  //   1.5-2.5  → 9-15
  //   1.0-1.5  → 4-9
  //   0.5-1.0  → 1-4
  //   < 0.5    → 0
  const uplift =
    input.refurbBudget > 0
      ? (input.arv - input.purchasePrice) / input.refurbBudget
      : 0
  let upliftScore: number
  if (uplift >= 2.5)      upliftScore = 15
  else if (uplift >= 1.5) upliftScore = Math.round(9 + ((uplift - 1.5) / 1.0) * 6)
  else if (uplift >= 1.0) upliftScore = Math.round(4 + ((uplift - 1.0) / 0.5) * 5)
  else if (uplift >= 0.5) upliftScore = Math.round(1 + ((uplift - 0.5) / 0.5) * 3)
  else                    upliftScore = 0

  // ── Axis 5 — Timeline risk (15 pts) ────────────────────────────────
  // Shorter project = lower carry-cost / market risk.
  //   ≤ 4mo    → 15
  //   5-6mo    → 12-15
  //   7-9mo    →  8-12
  //   10-12mo  →  4-8
  //   13-18mo  →  1-4
  //   ≥ 19mo   →  0
  const months = input.holdingMonths
  let timelineScore: number
  if (months <= 4)        timelineScore = 15
  else if (months <= 6)   timelineScore = Math.round(12 + ((6 - months) / 2) * 3)
  else if (months <= 9)   timelineScore = Math.round(8  + ((9 - months) / 3) * 4)
  else if (months <= 12)  timelineScore = Math.round(4  + ((12 - months) / 3) * 4)
  else if (months <= 18)  timelineScore = Math.round(1  + ((18 - months) / 6) * 3)
  else                    timelineScore = 0

  const total =
    marginScore + roiScore + seventyScore + upliftScore + timelineScore

  const label: FlipDealScore["label"] =
    total >= 85 ? "Excellent" :
    total >= 70 ? "Strong"    :
    total >= 50 ? "Decent"    :
    total >= 30 ? "Marginal"  :
                  "Poor"

  return {
    total: Math.min(100, Math.max(0, total)),
    label,
    breakdown: {
      profitMargin: {
        score: marginScore, max: 25, value: margin,
        note: `${margin.toFixed(1)}% margin vs ARV`,
      },
      postTaxROI: {
        score: roiScore, max: 25, value: roi,
        note: `${roi.toFixed(1)}% ROI after tax`,
      },
      seventyRule: {
        score: seventyScore, max: 20, value: seventyValue,
        note: input.passesStrict70
          ? "Passes strict 70% rule"
          : input.passesSimple70
            ? "Passes simple 70% rule only"
            : "Fails 70% rule",
      },
      refurbUplift: {
        score: upliftScore, max: 15, value: uplift,
        note: `${uplift.toFixed(2)}× uplift on refurb`,
      },
      timelineRisk: {
        score: timelineScore, max: 15, value: months,
        note: `${months}-month project`,
      },
    },
  }
}

/**
 * Estimate refurbishment cost based on floor area and condition.
 * Rates are per sq metre, adjusted for London postcodes and property type.
 *
 * Condition → mid-tier cost/sqft (2024-25 UK benchmarks, Checkatrade / BRRR):
 *   excellent    →  £0      (move-in ready, no refurb)
 *   good         →  £12.50  (minor cosmetic touches only)
 *   cosmetic     →  £25     (new kitchen/bathroom, redecoration)
 *   full-refurb  →  £50     (complete renovation throughout)
 *   structural   →  £87.50  (extensions, underpinning, rewiring, major works)
 */
export function estimateRefurbCost(
  sqft: number,
  condition: string,
  propertyType: string,
  postcode?: string
): number {
  if (!sqft || sqft <= 0) return 0

  // Cost per sqft by condition tier — UK benchmarks
  const costPerSqft: Record<string, number> = {
    excellent: 0,
    good: 12.5,
    cosmetic: 25,
    "full-refurb": 50,
    structural: 87.5,
  }

  const base = costPerSqft[condition] ?? 35

  // Property type multipliers (detached/bungalow cost more; flats less)
  const typeMultipliers: Record<string, number> = {
    flat: 0.85,
    house: 0.95,
    commercial: 1.0,
  }
  const typeMultiplier = typeMultipliers[propertyType] ?? 0.95

  // Regional multipliers from postcode prefix — matches backend REGION_MULT table
  const pc = (postcode ?? "").toUpperCase().replace(/\s/g, "")
  const REGION_MULT: Record<string, number> = {
    EC: 1.50, WC: 1.50, W1: 1.50, SW1: 1.50, SE1: 1.45, N1: 1.40,
    SW: 1.35, W: 1.35, NW: 1.30, E: 1.30,
    N: 1.25, SE: 1.25, KT: 1.25, TW: 1.25,
    BR: 1.20, CR: 1.20, RM: 1.20, HA: 1.20, UB: 1.20,
    SM: 1.20, WD: 1.15, EN: 1.15, IG: 1.15, DA: 1.15,
    GU: 1.20, RH: 1.20, SL: 1.15, AL: 1.15, OX: 1.15,
    RG: 1.15, HP: 1.10, CM: 1.10, BN: 1.10, TN: 1.10, ME: 1.05, CT: 1.05,
    B: 0.95, CV: 0.92, LE: 0.92, NG: 0.90, DE: 0.90, ST: 0.90,
    M: 0.90, L: 0.88, LS: 0.88, S: 0.87, NE: 0.87, HU: 0.85,
    PR: 0.87, BB: 0.85, BL: 0.85, OL: 0.85,
    EH: 0.90, G: 0.88, AB: 0.85, CF: 0.85, SA: 0.82,
  }
  // Match longest prefix first to avoid 'N' shadowing 'NW'
  const areaMultiplier = Object.keys(REGION_MULT)
    .sort((a, b) => b.length - a.length)
    .reduce((mult, prefix) => pc.startsWith(prefix) ? REGION_MULT[prefix] : mult, 1.0)

  return Math.round(sqft * base * typeMultiplier * areaMultiplier)
}
