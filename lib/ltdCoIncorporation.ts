/**
 * "I already own it" — keep a property personally vs move it into a company.
 *
 * Flask POST /v1/ltd-co/incorporation is the calc source of truth
 * (metusa-deal-analyzer ltd_co/incorporation.py): CGT on the transfer at
 * market value, company SDLT, refinancing costs, then the same operating
 * engine as the new-purchase comparison.
 */

export interface IncorporationInput {
  marketValue: number
  originalPurchasePrice: number
  purchaseCosts: number
  capitalImprovements: number
  outstandingMortgage: number
  monthlyRent: number
  annualOperatingExpenses: number
  otherTaxableIncome: number
  otherGainsThisYear: number
  personalInterestRatePercent: number
  companyInterestRatePercent: number
  earlyRepaymentCharge: number
  refinanceFees: number
  transferLegalFees: number
  annualAccountancyCost: number
  incorporationRelief: boolean
  partnershipSdltRelief: boolean
  horizonYears: number
  discountRatePercent: number
}

export const DEFAULT_INCORPORATION_INPUT: IncorporationInput = {
  marketValue: 250_000,
  originalPurchasePrice: 150_000,
  purchaseCosts: 5_000,
  capitalImprovements: 0,
  outstandingMortgage: 187_500,
  monthlyRent: 1_250,
  annualOperatingExpenses: 3_000,
  otherTaxableIncome: 60_000,
  otherGainsThisYear: 0,
  personalInterestRatePercent: 4.5,
  companyInterestRatePercent: 5.5,
  earlyRepaymentCharge: 0,
  refinanceFees: 1_995,
  transferLegalFees: 1_500,
  annualAccountancyCost: 1_200,
  incorporationRelief: false,
  partnershipSdltRelief: false,
  horizonYears: 10,
  discountRatePercent: 5,
}

export interface IncorporationResult {
  transfer: {
    marketValue: number
    baseCost: number
    total: number
    costs: {
      cgt: number
      sdlt: number
      earlyRepaymentCharge: number
      refinanceFees: number
      transferLegalFees: number
      formationCost: number
    }
    cgt: { gain: number; taxableGain: number; tax: number; deferredGain: number; notes: string[] }
    sdlt: { total: number; notes?: string[] }
  }
  npv: { pathA: number; pathB: number; deltaPathBMinusPathA: number }
  breakEven: { year: number | null }
  horizonYears: number
  metadata: { lean: string; rationale: string; disclaimers: string[] }
}

export function toIncorporationPayload(input: IncorporationInput): Record<string, unknown> {
  return {
    property: {
      marketValue: input.marketValue,
      originalPurchasePrice: input.originalPurchasePrice,
      purchaseCosts: input.purchaseCosts,
      capitalImprovements: input.capitalImprovements,
      monthlyRent: input.monthlyRent,
      annualOperatingExpenses: input.annualOperatingExpenses,
    },
    financing: {
      outstandingMortgage: input.outstandingMortgage,
      personalInterestRate: input.personalInterestRatePercent / 100,
      companyInterestRate: input.companyInterestRatePercent / 100,
      earlyRepaymentCharge: input.earlyRepaymentCharge,
      refinanceFees: input.refinanceFees,
      transferLegalFees: input.transferLegalFees,
    },
    landlord: {
      otherNonSavingsIncome: input.otherTaxableIncome,
      otherGainsThisYear: input.otherGainsThisYear,
    },
    company: {
      annualComplianceCost: input.annualAccountancyCost,
      extractDividends: "all",
    },
    reliefs: {
      incorporationRelief: input.incorporationRelief,
      partnershipSdltRelief: input.partnershipSdltRelief,
    },
    horizonYears: input.horizonYears,
    discountRate: input.discountRatePercent / 100,
  }
}

/** Client-side checks that mirror Flask's validation, with plain messages. */
export function validateIncorporationInput(input: IncorporationInput): string | null {
  if (!(input.marketValue > 0)) return "Enter what the property is worth today."
  if (!(input.originalPurchasePrice > 0)) return "Enter what you paid for the property."
  if (!(input.monthlyRent > 0)) return "Enter the monthly rent."
  if (input.outstandingMortgage > input.marketValue) {
    return "The mortgage can't be more than the property is worth."
  }
  return null
}
