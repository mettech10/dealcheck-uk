import type { PropertyFormData, CalculationResults, YearProjection } from "./types"

/**
 * Calculate UK Stamp Duty Land Tax (SDLT) for England/NI
 * Rates effective from April 2025
 */
export function calculateSDLT(
  price: number,
  isAdditional: boolean
): { total: number; breakdown: { band: string; tax: number }[] } {
  const surcharge = isAdditional ? 0.05 : 0

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
  if (isAdditional && price > 0 && price <= 125000) {
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
  const { total: sdltAmount, breakdown: sdltBreakdown } = calculateSDLT(
    data.purchasePrice,
    data.isAdditionalProperty
  )

  // Deposit & Mortgage
  const depositAmount =
    data.purchaseMethod === "cash"
      ? data.purchasePrice
      : Math.round(data.purchasePrice * (data.depositPercentage / 100))

  const mortgageAmount =
    data.purchaseMethod === "cash" ? 0 : data.purchasePrice - depositAmount

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

  // Mortgage payment
  const monthlyMortgagePayment =
    data.purchaseMethod === "cash"
      ? 0
      : calculateMortgagePayment(
          mortgageAmount,
          data.interestRate,
          data.mortgageTerm,
          data.mortgageType
        )

  const annualMortgageCost = monthlyMortgagePayment * 12

  // Rental income (adjusted for voids)
  const effectiveWeeks = 52 - data.voidWeeks
  const annualRent = Math.round(data.monthlyRent * 12 * (effectiveWeeks / 52))
  const monthlyIncome = Math.round((annualRent / 12) * 100) / 100

  // Running costs
  const monthlyManagement = data.monthlyRent * (data.managementFeePercent / 100)
  const monthlyInsurance = data.insurance / 12
  const monthlyMaintenance = data.maintenance / 12
  const monthlyGroundRent = data.groundRent / 12
  const monthlyServiceCharge = data.serviceCharge / 12

  const monthlyRunningCosts =
    Math.round(
      (monthlyManagement +
        monthlyInsurance +
        monthlyMaintenance +
        monthlyGroundRent +
        monthlyServiceCharge) *
        100
    ) / 100

  const annualRunningCosts = Math.round(monthlyRunningCosts * 12 * 100) / 100

  // Total monthly expenses
  const monthlyExpenses =
    Math.round((monthlyMortgagePayment + monthlyRunningCosts) * 100) / 100

  // Cash flow
  const monthlyCashFlow = Math.round((monthlyIncome - monthlyExpenses) * 100) / 100
  const annualCashFlow = Math.round(monthlyCashFlow * 12 * 100) / 100

  // Yields
  const grossYield = calculateGrossYield(annualRent, data.purchasePrice)
  const netYield = calculateNetYield(
    annualRent,
    annualRunningCosts + annualMortgageCost,
    data.purchasePrice
  )

  // ROI (cash-on-cash return)
  const cashOnCashReturn =
    totalCapitalRequired > 0
      ? Math.round((annualCashFlow / totalCapitalRequired) * 10000) / 100
      : 0

  // 5-year projection
  const fiveYearProjection = calculateProjection(
    data.purchasePrice,
    annualRent,
    annualCashFlow,
    mortgageAmount,
    3,
    data.annualRentIncrease
  )

  return {
    sdltAmount,
    sdltBreakdown,
    totalPurchaseCost,
    totalCapitalRequired,
    depositAmount,
    mortgageAmount,
    monthlyMortgagePayment,
    annualMortgageCost,
    grossYield,
    netYield,
    monthlyIncome,
    monthlyExpenses,
    monthlyCashFlow,
    annualCashFlow,
    cashOnCashReturn,
    annualRunningCosts,
    monthlyRunningCosts,
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
