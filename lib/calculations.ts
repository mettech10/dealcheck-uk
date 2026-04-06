import type { PropertyFormData, CalculationResults, YearProjection } from "./types"

/**
 * Calculate UK Stamp Duty Land Tax (SDLT) for England/NI
 * Rates effective from April 2025
 */
export function calculateSDLT(
  price: number,
  buyerType: "first-time" | "additional"
): { total: number; breakdown: { band: string; tax: number }[] } {
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
  // ── Serviced Accommodation (R2SA or SA-owned) ──────────────────────────
  if (data.investmentType === "r2sa") {
    const isOwned = data.saOwnershipType === "own"
    const saRevenue = data.saMonthlySARevenue || 0

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
      const setupCosts = data.saSetupCosts || 5000
      const monthlyExpenses = Math.round((rentPaid + monthlyOpCosts) * 100) / 100
      const monthlyCashFlow = Math.round((saRevenue - monthlyExpenses) * 100) / 100
      const annualCashFlow  = Math.round(monthlyCashFlow * 12 * 100) / 100
      const cashOnCashReturn =
        setupCosts > 0 ? Math.round((annualCashFlow / setupCosts) * 10000) / 100 : 0

      return {
        sdltAmount: 0,
        sdltBreakdown: [],
        totalPurchaseCost: 0,
        totalCapitalRequired: setupCosts,
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
  if (data.investmentType === "flip") {
    const arv = data.arv || data.purchasePrice // selling price
    const { total: sdltAmount, breakdown: sdltBreakdown } = calculateSDLT(data.purchasePrice, data.buyerType)

    // Finance costs (bridging or mortgage during the hold period)
    let financeCosts = 0
    let bridgingDetails = undefined
    if (data.purchaseType === "bridging-loan") {
      const bridgingLoanAmt = data.purchasePrice - Math.round(data.purchasePrice * (data.depositPercentage / 100))
      const bRate = data.bridgingMonthlyRate || 0.75
      const bTerm = data.bridgingTermMonths || 12
      const result = calculateBridgingLoan(bridgingLoanAmt, bRate, bTerm, data.bridgingArrangementFee || 1, data.bridgingExitFee || 0.5, true)
      financeCosts = result.totalCost
      bridgingDetails = {
        loanAmount: bridgingLoanAmt,
        monthlyInterestRate: bRate, termMonths: bTerm,
        monthlyInterest: result.monthlyInterest, totalInterest: result.totalInterest,
        arrangementFee: result.arrangementFee, exitFee: result.exitFee,
        totalCost: result.totalCost, totalRepayment: result.totalRepayment, apr: result.apr,
      }
    } else if (data.purchaseType === "mortgage") {
      const mortAmt = data.purchasePrice - Math.round(data.purchasePrice * (data.depositPercentage / 100))
      const holdMonths = data.bridgingTermMonths || 6 // how long to hold before selling
      const monthlyPayment = calculateMortgagePayment(mortAmt, data.interestRate, data.mortgageTerm, data.mortgageType)
      financeCosts = monthlyPayment * holdMonths
    }

    // Selling costs: estate agent (~1.5% + VAT = ~1.8%) + selling legal (~£1,000)
    const agentFee = Math.round(arv * 0.018)
    const sellingLegal = 1000
    const sellingCosts = agentFee + sellingLegal

    // Total capital required (what the investor puts in)
    const depositAmount = data.purchaseType === "cash" ? data.purchasePrice
      : Math.round(data.purchasePrice * (data.depositPercentage / 100))
    const totalCapitalRequired = depositAmount + sdltAmount + data.legalFees + data.surveyCosts + data.refurbishmentBudget
    const totalPurchaseCost = data.purchasePrice + sdltAmount + data.legalFees + data.surveyCosts + data.refurbishmentBudget

    // Profit calculation
    const grossProfit = arv - data.purchasePrice - data.refurbishmentBudget
    const netProfit = arv - data.purchasePrice - data.refurbishmentBudget - sdltAmount - data.legalFees - data.surveyCosts - sellingCosts - financeCosts
    const flipROI = totalCapitalRequired > 0 ? Math.round((netProfit / totalCapitalRequired) * 10000) / 100 : 0

    return {
      sdltAmount, sdltBreakdown,
      totalPurchaseCost,
      totalCapitalRequired,
      depositAmount,
      mortgageAmount: data.purchaseType === "cash" ? 0 : data.purchasePrice - depositAmount,
      monthlyMortgagePayment: 0,
      annualMortgageCost: 0,
      bridgingLoanDetails: bridgingDetails,
      grossYield: 0, // not applicable for flip
      netYield: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlyCashFlow: 0,
      annualCashFlow: netProfit, // use annualCashFlow to show the profit figure
      cashOnCashReturn: flipROI,
      annualRunningCosts: 0,
      monthlyRunningCosts: 0,
      flipGrossProfit: grossProfit,
      flipSellingCosts: sellingCosts,
      flipFinanceCosts: financeCosts,
      flipNetProfit: netProfit,
      flipROI,
      fiveYearProjection: [],
    }
  }

  const { total: sdltAmount, breakdown: sdltBreakdown } = calculateSDLT(
    data.purchasePrice,
    data.buyerType
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

  // Rental income (adjusted for voids)
  const effectiveWeeks = 52 - data.voidWeeks
  const annualRent = Math.round(data.monthlyRent * 12 * (effectiveWeeks / 52))
  const monthlyIncome = Math.round((annualRent / 12) * 100) / 100

  // Running costs
  const monthlyManagement = data.monthlyRent * (data.managementFeePercent / 100)
  const monthlyInsurance = data.insurance / 12
  // Maintenance: prefer percentage of annual rent; fall back to flat amount
  const maintenanceAnnual = data.maintenancePercent > 0
    ? annualRent * (data.maintenancePercent / 100)
    : data.maintenance
  const monthlyMaintenance = maintenanceAnnual / 12
  const monthlyGroundRent = data.groundRent / 12
  const monthlyBills = data.bills // Bills is entered as a monthly figure

  const monthlyRunningCosts =
    Math.round(
      (monthlyManagement +
        monthlyInsurance +
        monthlyMaintenance +
        monthlyGroundRent +
        monthlyBills) *
        100
    ) / 100

  const annualRunningCosts = Math.round(monthlyRunningCosts * 12 * 100) / 100

  // Total monthly expenses
  const monthlyExpenses =
    Math.round((monthlyMortgagePayment + monthlyRunningCosts) * 100) / 100

  // ── BRRRR Refinance Logic ──────────────────────────────────────────────
  // For BRR strategy: refinance based on ARV, recalculate mortgage & ROI
  let refinancedMortgageAmount: number | undefined
  let moneyLeftInDeal: number | undefined
  let equityGained: number | undefined
  let finalMortgageAmount = mortgageAmount
  let finalMonthlyMortgage = monthlyMortgagePayment
  let finalAnnualMortgage = annualMortgageCost
  let finalTotalCapital = totalCapitalRequired

  if (data.investmentType === "brr" && data.arv && data.arv > 0) {
    // Refinance: new mortgage based on ARV at the same LTV as deposit%
    const refinanceLTV = (100 - data.depositPercentage) / 100
    refinancedMortgageAmount = Math.round(data.arv * refinanceLTV)

    // New monthly mortgage payment on the refinanced amount
    // Always calculated for BRRRR — even if initial purchase was cash,
    // the refinance creates a new mortgage
    finalMonthlyMortgage = calculateMortgagePayment(
      refinancedMortgageAmount,
      data.interestRate,
      data.mortgageTerm,
      data.mortgageType
    )
    finalAnnualMortgage = finalMonthlyMortgage * 12
    finalMortgageAmount = refinancedMortgageAmount

    // Total cash invested upfront (before refinance returns capital)
    // Includes: purchase price + SDLT + legal + survey + refurb (full amount, whether cash or bridging)
    const totalCashInvested = data.purchasePrice + sdltAmount + data.legalFees + data.surveyCosts + data.refurbishmentBudget

    // Capital returned at refinance: the refinanced mortgage pays off the original loan,
    // and any excess is returned to the investor
    const originalLoanPayoff = mortgageAmount // bridging or original mortgage to repay
    const capitalReturned = Math.max(0, refinancedMortgageAmount - originalLoanPayoff)

    // Money left in deal = what you put in minus what you get back
    moneyLeftInDeal = Math.max(0, totalCapitalRequired - capitalReturned)
    finalTotalCapital = moneyLeftInDeal

    // Equity gained through forced appreciation (refurb uplift)
    equityGained = data.arv - data.purchasePrice - data.refurbishmentBudget
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
  const grossYield = calculateGrossYield(annualRent, data.purchasePrice)
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
