/**
 * Personal vs Ltd Co after-tax comparison for UK residential landlords.
 *
 * Tax year: 2026/27. Rates are England & Northern Ireland. Scotland and
 * Wales are accepted as a region flag only — the engine still applies
 * E&NI income-tax bands and surfaces `flags.devolvedNation`.
 *
 * Dual lenses (always both):
 *   - entity retained  — cash left in the company after corporation tax
 *   - owner extracted  — cash the owner takes as a dividend after CT +
 *                        dividend tax (100% of post-CT property profit)
 *
 * Intentionally not modelled (MVP): CGT/CT on disposal, ATED, 15%
 * enveloped-dwellings SDLT, Scottish bands, salary/NI extraction,
 * s455 loans, MTD, licensing, capital allowances, marriage allowance.
 *
 * Recommendation copy is a soft lean only. It must never tell the user
 * to incorporate, or to do anything now.
 */

export const LTD_CO_TAX_YEAR = "2026/27"

export const LTD_CO_DISCLAIMER =
  "Educational illustration only — not tax, legal or financial advice. Figures use England & Northern Ireland 2026/27 rates and a simplified model. Always take regulated advice before changing how a property is owned."

export const LTD_CO_DISCLAIMER_WALL = [
  "This tool is an educational illustration of after-tax cash for a residential landlord holding a property personally versus in a limited company.",
  "It is not tax advice, legal advice, financial advice, or a recommendation to change ownership structure.",
  "Rates are England & Northern Ireland 2026/27. Scotland and Wales are flagged only — they are not modelled as separate tax systems here.",
  "Outputs are a soft lean only (which structure left more after tax in this model). The tool will never tell you to incorporate, or to do anything now.",
  "Always take regulated advice from a qualified accountant or tax adviser before acting.",
] as const

/** Phrases the lean copy is forbidden from emitting. Pinned in tests. */
export const BANNED_LEAN_PHRASES = [
  "incorporate now",
  "you should incorporate",
  "you must incorporate",
  "set up a limited company",
  "set up a company",
  "form a company",
  "form a limited company",
  "you should set up",
  "you must set up",
  "do this now",
  "incorporate immediately",
] as const

// ── 2026/27 E&NI constants ───────────────────────────────────────────
export const PERSONAL_ALLOWANCE = 12_570
export const PA_TAPER_START = 100_000
export const BASIC_RATE_BAND = 37_700
export const ADDITIONAL_RATE_THRESHOLD = 125_140
export const BASIC_RATE = 0.2
export const HIGHER_RATE = 0.4
export const ADDITIONAL_RATE = 0.45
export const DIVIDEND_ALLOWANCE = 500
/** 2026/27 ordinary / upper / additional — matches Flask BE rate pack. */
export const DIVIDEND_ORDINARY_RATE = 0.1075
export const DIVIDEND_UPPER_RATE = 0.3575
export const DIVIDEND_ADDITIONAL_RATE = 0.3935
export const S24_REDUCTION_RATE = 0.2
export const CT_SMALL_PROFITS_RATE = 0.19
export const CT_MAIN_RATE = 0.25
export const CT_LOWER_LIMIT = 50_000
export const CT_UPPER_LIMIT = 250_000
/** Marginal relief standard fraction for 19% → 25% (3/200). */
export const CT_MARGINAL_RELIEF_FRACTION = 3 / 200

export type CalculatorMode = "landlord" | "broker"
export type UkRegion = "england-ni" | "scotland" | "wales"
export type LeanSide = "personal" | "ltd" | "close"

export interface LtdCoDealEconomics {
  annualGrossRent: number
  annualOperatingCosts: number
  annualFinanceCosts: number
  rentGrowthPercent: number
  costGrowthPercent: number
  financeGrowthPercent: number
  /** Required by the BE compare API (SDLT / capital). Unused by the local operating engine. */
  purchasePrice: number
}

export interface LtdCoPersonalProfile {
  otherTaxableIncome: number
  region: UkRegion
}

export interface LtdCoCompanyProfile {
  /** Extra associated companies (0 = this company only). Splits CT bands. */
  associatedCompanies: number
  annualAccountancyCost: number
  otherCompanyProfits: number
  setupCostYear1: number
}

export interface LtdCoHorizon {
  years: number
  discountRatePercent: number
}

export interface LtdCoCompareInput {
  mode?: CalculatorMode
  deal: LtdCoDealEconomics
  personal: LtdCoPersonalProfile
  company: LtdCoCompanyProfile
  horizon: LtdCoHorizon
  dealId?: string | null
}

export interface LtdCoYearRow {
  year: number
  rent: number
  operatingCosts: number
  financeCosts: number
  personalTax: number
  personalAfterTax: number
  personalCumulative: number
  ltdCorporationTax: number
  ltdAccountancy: number
  ltdRetainedAfterTax: number
  ltdRetainedCumulative: number
  ltdDividendTax: number
  ltdExtractedAfterTax: number
  ltdExtractedCumulative: number
}

export interface LtdCoLensSummary {
  year1AfterTax: number
  cumulative: number
  npv: number
  breakEvenYear: number | null
  lean: LeanSide
  copy: string
  /** Cumulative Ltd − personal at the horizon (positive = Ltd ahead). */
  cumulativeDelta: number
}

export interface LtdCoBrokerPlaceholder {
  enabled: false
  version: "mvp-placeholder"
  slots: {
    clientPack: { status: "unavailable"; label: string }
    multiDealOverlay: { status: "unavailable"; label: string }
    adviserNotes: { status: "unavailable"; label: string }
  }
}

export interface LtdCoCompareResult {
  taxYear: typeof LTD_CO_TAX_YEAR
  mode: CalculatorMode
  disclaimer: string
  flags: {
    devolvedNation: boolean
    devolvedNationNote: string | null
    educationalOnly: true
  }
  assumptions: string[]
  personal: LtdCoLensSummary
  retained: LtdCoLensSummary
  extracted: LtdCoLensSummary
  years: LtdCoYearRow[]
  broker: LtdCoBrokerPlaceholder
}

export const BROKER_PLACEHOLDER: LtdCoBrokerPlaceholder = {
  enabled: false,
  version: "mvp-placeholder",
  slots: {
    clientPack: {
      status: "unavailable",
      label: "Client packs",
    },
    multiDealOverlay: {
      status: "unavailable",
      label: "Multi-deal overlay",
    },
    adviserNotes: {
      status: "unavailable",
      label: "Adviser notes",
    },
  },
}

export const DEFAULT_LTD_CO_INPUT: LtdCoCompareInput = {
  mode: "landlord",
  deal: {
    annualGrossRent: 11_400,
    annualOperatingCosts: 2_500,
    annualFinanceCosts: 5_550,
    rentGrowthPercent: 3,
    costGrowthPercent: 2.5,
    financeGrowthPercent: 0,
    purchasePrice: 185_000,
  },
  personal: {
    otherTaxableIncome: 50_000,
    region: "england-ni",
  },
  company: {
    associatedCompanies: 0,
    annualAccountancyCost: 1_500,
    otherCompanyProfits: 0,
    setupCostYear1: 0,
  },
  horizon: {
    years: 10,
    discountRatePercent: 5,
  },
}

const CLOSE_CUMULATIVE_THRESHOLD = 2_000

function gbp(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

function clampNonNeg(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

export function personalAllowanceFor(totalIncome: number): number {
  const income = clampNonNeg(totalIncome)
  if (income <= PA_TAPER_START) return PERSONAL_ALLOWANCE
  const reduction = Math.floor((income - PA_TAPER_START) / 2)
  return Math.max(0, PERSONAL_ALLOWANCE - reduction)
}

interface IncomeTaxSplit {
  incomeTax: number
  dividendTax: number
  total: number
}

/**
 * E&NI income tax on non-savings non-dividend income plus dividends.
 * Personal allowance is applied to NSND first; leftover PA reduces dividends.
 * The £500 dividend allowance is taxed at 0% but still occupies the band.
 */
export function assessUkIncomeTax(nsnd: number, dividends = 0): IncomeTaxSplit {
  const nsndInc = clampNonNeg(nsnd)
  const divInc = clampNonNeg(dividends)
  const pa = personalAllowanceFor(nsndInc + divInc)

  const nsndAfterPa = Math.max(0, nsndInc - pa)
  const paLeft = Math.max(0, pa - nsndInc)
  const divAfterPa = Math.max(0, divInc - paLeft)

  const bands: { to: number; ir: number; dr: number }[] = [
    { to: BASIC_RATE_BAND, ir: BASIC_RATE, dr: DIVIDEND_ORDINARY_RATE },
    {
      to: ADDITIONAL_RATE_THRESHOLD,
      ir: HIGHER_RATE,
      dr: DIVIDEND_UPPER_RATE,
    },
    { to: Number.POSITIVE_INFINITY, ir: ADDITIONAL_RATE, dr: DIVIDEND_ADDITIONAL_RATE },
  ]

  let nsndLeft = nsndAfterPa
  let divLeft = divAfterPa
  let daLeft = Math.min(DIVIDEND_ALLOWANCE, divAfterPa)
  let incomeTax = 0
  let dividendTax = 0
  let from = 0

  for (const band of bands) {
    const width = band.to - from
    const nsndHere = Math.min(nsndLeft, width)
    incomeTax += nsndHere * band.ir
    nsndLeft -= nsndHere
    const space = width - nsndHere
    const divHere = Math.min(divLeft, space)
    const daHere = Math.min(daLeft, divHere)
    dividendTax += (divHere - daHere) * band.dr
    daLeft -= daHere
    divLeft -= divHere
    from = band.to
  }

  return {
    incomeTax: gbp(incomeTax),
    dividendTax: gbp(dividendTax),
    total: gbp(incomeTax + dividendTax),
  }
}

/**
 * Incremental income tax on adding `propertyProfit` to `otherIncome`.
 */
export function incrementalIncomeTax(
  otherIncome: number,
  propertyProfit: number,
): number {
  const other = clampNonNeg(otherIncome)
  const profit = Math.max(0, propertyProfit)
  const without = assessUkIncomeTax(other, 0).total
  const withProp = assessUkIncomeTax(other + profit, 0).total
  return Math.max(0, withProp - without)
}

/**
 * Dividend tax on distributing `dividend` on top of `otherIncome`.
 */
export function incrementalDividendTax(
  otherIncome: number,
  dividend: number,
): number {
  const other = clampNonNeg(otherIncome)
  const div = clampNonNeg(dividend)
  const without = assessUkIncomeTax(other, 0)
  const withDiv = assessUkIncomeTax(other, div)
  return Math.max(0, withDiv.dividendTax - without.dividendTax)
}

export type Section24BindingLimb =
  | "finance_costs"
  | "property_profits"
  | "adjusted_total_income"

export interface Section24Result {
  propertyProfit: number
  propertyLossCarriedForward: number
  relievableAmount: number
  limbFinanceCosts: number
  limbPropertyProfits: number
  limbAdjustedTotalIncome: number
  bindingLimb: Section24BindingLimb
  actualAmount: number
  taxReducer: number
  financeCostsCarriedForward: number
}

/** ITTOIA 2005 s274AA(6): net income, exclude savings/dividends, deduct PA. */
export function adjustedTotalIncome(opts: {
  netIncome: number
  savingsIncome?: number
  dividendIncome?: number
  personalAllowance: number
}): number {
  const afterExclude = Math.max(
    0,
    opts.netIncome -
      clampNonNeg(opts.savingsIncome ?? 0) -
      clampNonNeg(opts.dividendIncome ?? 0),
  )
  return Math.max(0, afterExclude - clampNonNeg(opts.personalAllowance))
}

function section24BindingLimb(
  finance: number,
  profits: number,
  ati: number,
): Section24BindingLimb {
  const lowest = Math.min(finance, profits, ati)
  if (finance === lowest) return "finance_costs"
  if (profits === lowest) return "property_profits"
  return "adjusted_total_income"
}

/**
 * ITTOIA 2005 ss272A / 274A / 274AA. Test-only mirror of Flask BE #96.
 * Reducer = 20% × lower of (relievable finance incl. b/f, property profits
 * after s118 losses, adjusted total income after PA). Unused finance carries
 * forward. Reducer cannot create a refund.
 */
export function computeSection24(opts: {
  rentalIncome: number
  allowableNonFinanceExpenses: number
  financeCosts: number
  otherNonSavingsIncome?: number
  financeCostsBroughtForward?: number
  propertyLossesBroughtForward?: number
}): Section24Result {
  const rent = clampNonNeg(opts.rentalIncome)
  const opex = clampNonNeg(opts.allowableNonFinanceExpenses)
  const interest = clampNonNeg(opts.financeCosts)
  const bfFin = clampNonNeg(opts.financeCostsBroughtForward ?? 0)
  const bfLoss = clampNonNeg(opts.propertyLossesBroughtForward ?? 0)

  const profitBeforeLosses = rent - opex
  let lossCf = 0
  let profitAfterCurrent = 0
  if (profitBeforeLosses < 0) {
    lossCf = -profitBeforeLosses
    profitAfterCurrent = 0
  } else {
    profitAfterCurrent = profitBeforeLosses
  }

  let propertyProfit = 0
  if (bfLoss > profitAfterCurrent) {
    propertyProfit = 0
    lossCf += bfLoss - profitAfterCurrent
  } else {
    propertyProfit = profitAfterCurrent - bfLoss
  }

  const relievable = interest + bfFin
  const limbFinance = relievable
  const limbProfits = propertyProfit
  const L = Math.min(limbFinance, limbProfits)

  const otherNs = clampNonNeg(opts.otherNonSavingsIncome ?? 0)
  const netIncome = otherNs + propertyProfit
  const pa = personalAllowanceFor(netIncome)
  const ati = adjustedTotalIncome({
    netIncome,
    personalAllowance: pa,
  })

  const actual = L > ati ? ati : L
  const taxReducer = gbp(actual * S24_REDUCTION_RATE)
  const carried = Math.max(0, relievable - actual)

  return {
    propertyProfit,
    propertyLossCarriedForward: lossCf,
    relievableAmount: relievable,
    limbFinanceCosts: limbFinance,
    limbPropertyProfits: limbProfits,
    limbAdjustedTotalIncome: ati,
    bindingLimb: section24BindingLimb(limbFinance, limbProfits, ati),
    actualAmount: actual,
    taxReducer,
    financeCostsCarriedForward: carried,
  }
}

export function corporationTaxOn(profits: number, associatedCompanies = 0): number {
  const p = Math.max(0, profits)
  if (p === 0) return 0
  const companies = Math.max(1, Math.floor(associatedCompanies) + 1)
  const lower = CT_LOWER_LIMIT / companies
  const upper = CT_UPPER_LIMIT / companies
  if (p <= lower) return gbp(p * CT_SMALL_PROFITS_RATE)
  if (p >= upper) return gbp(p * CT_MAIN_RATE)
  return gbp(p * CT_MAIN_RATE - (upper - p) * CT_MARGINAL_RELIEF_FRACTION)
}

export function incrementalCorporationTax(
  otherProfits: number,
  propertyProfit: number,
  associatedCompanies = 0,
): number {
  const other = Math.max(0, otherProfits)
  const profit = propertyProfit
  const withProp = corporationTaxOn(other + Math.max(0, profit), associatedCompanies)
  const without = corporationTaxOn(other, associatedCompanies)
  if (profit >= 0) return Math.max(0, withProp - without)
  // A property loss can reduce CT on other profits.
  return withProp - without
}

export function npvOf(cashflows: number[], discountRatePercent: number): number {
  const r = discountRatePercent / 100
  let total = 0
  cashflows.forEach((cf, i) => {
    const t = i + 1
    total += cf / Math.pow(1 + r, t)
  })
  return gbp(total)
}

export function breakEvenYear(
  ltdCumulative: number[],
  personalCumulative: number[],
): number | null {
  for (let i = 0; i < ltdCumulative.length; i++) {
    if (ltdCumulative[i] > personalCumulative[i]) return i + 1
  }
  return null
}

export function leanSide(delta: number): LeanSide {
  if (Math.abs(delta) < CLOSE_CUMULATIVE_THRESHOLD) return "close"
  return delta > 0 ? "ltd" : "personal"
}

export function leanCopy(side: LeanSide, lens: "retained" | "extracted"): string {
  if (side === "close") {
    return "The two structures are close on this lens. Small changes in rent, interest or how much you take out can flip the comparison."
  }
  if (lens === "retained" && side === "ltd") {
    return "On a retained-profit basis, a company structure may leave more after tax over this horizon. This is an illustration, not advice to change how the property is owned."
  }
  if (lens === "retained" && side === "personal") {
    return "On a retained-profit basis, holding personally may leave more after tax over this horizon. Company running costs and corporation tax are part of that gap."
  }
  if (lens === "extracted" && side === "ltd") {
    return "On an extracted-cash basis, a company structure may leave more in the owner's pocket over this horizon. Extraction method, dividend tax and salary mix can change this picture."
  }
  return "On an extracted-cash basis, holding personally may leave more in the owner's pocket over this horizon. Taking cash out of a company often adds a second layer of tax."
}

export function leanContainsBannedPhrase(copy: string): boolean {
  const lower = copy.toLowerCase()
  return BANNED_LEAN_PHRASES.some((phrase) => lower.includes(phrase))
}

function grow(base: number, ratePercent: number, yearIndex: number): number {
  return base * Math.pow(1 + ratePercent / 100, yearIndex)
}

function devolvedNote(region: UkRegion): string | null {
  if (region === "scotland") {
    return "Scotland selected — this comparison still uses England & Northern Ireland income-tax bands. Scottish bands and rates differ. Treat this as a directional flag, not a Scotland-specific model."
  }
  if (region === "wales") {
    return "Wales selected — this comparison uses England & Northern Ireland income-tax bands. Welsh rates currently follow England; this is a flag only, not a Wales-specific model."
  }
  return null
}

export function comparePersonalVsLtd(
  raw: LtdCoCompareInput,
): LtdCoCompareResult {
  const mode: CalculatorMode = raw.mode === "broker" ? "broker" : "landlord"
  const years = Math.min(30, Math.max(1, Math.floor(raw.horizon.years) || 1))
  const discount = clampNonNeg(raw.horizon.discountRatePercent)
  const otherIncome = clampNonNeg(raw.personal.otherTaxableIncome)
  const region: UkRegion =
    raw.personal.region === "scotland" || raw.personal.region === "wales"
      ? raw.personal.region
      : "england-ni"
  const associated = Math.max(0, Math.floor(raw.company.associatedCompanies) || 0)
  const accountancy = clampNonNeg(raw.company.annualAccountancyCost)
  const otherCt = Math.max(0, raw.company.otherCompanyProfits)
  const setup = clampNonNeg(raw.company.setupCostYear1)

  const rent0 = clampNonNeg(raw.deal.annualGrossRent)
  const op0 = clampNonNeg(raw.deal.annualOperatingCosts)
  const fin0 = clampNonNeg(raw.deal.annualFinanceCosts)
  const rentG = raw.deal.rentGrowthPercent
  const costG = raw.deal.costGrowthPercent
  const finG = raw.deal.financeGrowthPercent

  let s24Carry = 0
  let personalLossCarry = 0
  let ltdLossCarry = 0

  const rows: LtdCoYearRow[] = []
  const personalCf: number[] = []
  const retainedCf: number[] = []
  const extractedCf: number[] = []

  let personalCum = 0
  let retainedCum = 0
  let extractedCum = 0

  for (let i = 0; i < years; i++) {
    const rent = gbp(grow(rent0, rentG, i))
    const operatingCosts = gbp(grow(op0, costG, i))
    const financeCosts = gbp(grow(fin0, finG, i))
    const ltdAdmin = gbp(accountancy + (i === 0 ? setup : 0))

    // Personal — s.24: finance is not deducted; 20% tax reducer on the
    // statutory lower of finance costs (incl. b/f), property profits, ATI.
    const s24 = computeSection24({
      rentalIncome: rent,
      allowableNonFinanceExpenses: operatingCosts,
      financeCosts,
      otherNonSavingsIncome: otherIncome,
      financeCostsBroughtForward: s24Carry,
      propertyLossesBroughtForward: personalLossCarry,
    })
    const taxablePersonalProfit = s24.propertyProfit
    const grossIncomeTax = incrementalIncomeTax(otherIncome, taxablePersonalProfit)
    const personalTax = Math.max(0, grossIncomeTax - s24.taxReducer)
    s24Carry = s24.financeCostsCarriedForward
    personalLossCarry = s24.propertyLossCarriedForward

    const personalAfterTax = gbp(
      rent - operatingCosts - financeCosts - personalTax,
    )

    // Ltd — finance + accountancy deducted; CT on residual.
    const ltdProfitBeforeLoss =
      rent - operatingCosts - financeCosts - ltdAdmin
    const ltdProfitAfterLoss = ltdProfitBeforeLoss - ltdLossCarry
    let taxableLtdProfit = 0
    if (ltdProfitAfterLoss >= 0) {
      taxableLtdProfit = ltdProfitAfterLoss
      ltdLossCarry = 0
    } else {
      taxableLtdProfit = 0
      ltdLossCarry = -ltdProfitAfterLoss
    }

    const ltdCt = incrementalCorporationTax(
      otherCt,
      ltdProfitAfterLoss,
      associated,
    )
    const ltdRetainedAfterTax = gbp(ltdProfitBeforeLoss - Math.max(0, ltdCt))
    const distributable = Math.max(0, gbp(taxableLtdProfit - Math.max(0, ltdCt)))
    const ltdDividendTax = incrementalDividendTax(otherIncome, distributable)
    const ltdExtractedAfterTax = gbp(distributable - ltdDividendTax)

    personalCum += personalAfterTax
    retainedCum += ltdRetainedAfterTax
    extractedCum += ltdExtractedAfterTax

    personalCf.push(personalAfterTax)
    retainedCf.push(ltdRetainedAfterTax)
    extractedCf.push(ltdExtractedAfterTax)

    rows.push({
      year: i + 1,
      rent,
      operatingCosts,
      financeCosts,
      personalTax,
      personalAfterTax,
      personalCumulative: personalCum,
      ltdCorporationTax: Math.max(0, ltdCt),
      ltdAccountancy: ltdAdmin,
      ltdRetainedAfterTax,
      ltdRetainedCumulative: retainedCum,
      ltdDividendTax,
      ltdExtractedAfterTax,
      ltdExtractedCumulative: extractedCum,
    })
  }

  const retainedDelta = retainedCum - personalCum
  const extractedDelta = extractedCum - personalCum
  const retainedLean = leanSide(retainedDelta)
  const extractedLean = leanSide(extractedDelta)
  const retainedCopy = leanCopy(retainedLean, "retained")
  const extractedCopy = leanCopy(extractedLean, "extracted")

  const personalNpv = npvOf(personalCf, discount)
  const retainedNpv = npvOf(retainedCf, discount)
  const extractedNpv = npvOf(extractedCf, discount)

  const note = devolvedNote(region)

  return {
    taxYear: LTD_CO_TAX_YEAR,
    mode,
    disclaimer: LTD_CO_DISCLAIMER,
    flags: {
      devolvedNation: region !== "england-ni",
      devolvedNationNote: note,
      educationalOnly: true,
    },
    assumptions: [
      `Tax year ${LTD_CO_TAX_YEAR}, England & Northern Ireland income-tax and dividend rates.`,
      "Section 24: residential finance costs are not deducted for an individual; a 20% tax reducer applies to the lower of relievable finance costs, property profits, and adjusted total income after the personal allowance.",
      "Ltd lens deducts finance costs in full and applies corporation tax (19% / marginal relief / 25%).",
      "Extracted lens assumes 100% of post-CT property profit is paid as a dividend the same year. Salary / NI extraction is not modelled.",
      "Disposal (CGT / CT on sale), ATED, 15% enveloped-dwellings SDLT, MTD and licensing are not modelled.",
      `NPV uses end-of-year cash flows discounted at ${discount}% for ${years} year${years === 1 ? "" : "s"}.`,
    ],
    personal: {
      year1AfterTax: rows[0]?.personalAfterTax ?? 0,
      cumulative: personalCum,
      npv: personalNpv,
      breakEvenYear: null,
      lean: "personal",
      copy: "Personal holding is the baseline on both lenses.",
      cumulativeDelta: 0,
    },
    retained: {
      year1AfterTax: rows[0]?.ltdRetainedAfterTax ?? 0,
      cumulative: retainedCum,
      npv: retainedNpv,
      breakEvenYear: breakEvenYear(
        rows.map((r) => r.ltdRetainedCumulative),
        rows.map((r) => r.personalCumulative),
      ),
      lean: retainedLean,
      copy: retainedCopy,
      cumulativeDelta: retainedDelta,
    },
    extracted: {
      year1AfterTax: rows[0]?.ltdExtractedAfterTax ?? 0,
      cumulative: extractedCum,
      npv: extractedNpv,
      breakEvenYear: breakEvenYear(
        rows.map((r) => r.ltdExtractedCumulative),
        rows.map((r) => r.personalCumulative),
      ),
      lean: extractedLean,
      copy: extractedCopy,
      cumulativeDelta: extractedDelta,
    },
    years: rows,
    broker: BROKER_PLACEHOLDER,
  }
}

export function ltdCoPrefillFromDeal(args: {
  monthlyRent?: number | null
  annualRunningCosts?: number | null
  annualMortgageCost?: number | null
  monthlyIncome?: number | null
}): Pick<LtdCoDealEconomics, "annualGrossRent" | "annualOperatingCosts" | "annualFinanceCosts"> {
  const rent =
    args.monthlyIncome && args.monthlyIncome > 0
      ? args.monthlyIncome * 12
      : (args.monthlyRent ?? 0) * 12
  return {
    annualGrossRent: gbp(rent),
    annualOperatingCosts: gbp(args.annualRunningCosts ?? 0),
    annualFinanceCosts: gbp(args.annualMortgageCost ?? 0),
  }
}

/** Fail-closed input gate — compare must not lean on empty/zero required fields. */
export type LtdCoRequiredField = "annualGrossRent" | "purchasePrice"

export type LtdCoValidationIssue = {
  field: LtdCoRequiredField
  message: string
}

export const LTD_CO_GROSS_RENT_REQUIRED =
  "Enter Gross rent to compare structures."
export const LTD_CO_PURCHASE_PRICE_REQUIRED =
  "Enter Purchase price to compare structures."

export function parseLtdCoAmount(raw: string): number | null {
  const trimmed = String(raw).replace(/,/g, "").trim()
  if (trimmed === "") return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

function requiredPositive(
  value: number | null,
  field: LtdCoRequiredField,
  emptyMessage: string,
): LtdCoValidationIssue | null {
  if (value === null || !Number.isFinite(value)) {
    return { field, message: emptyMessage }
  }
  if (value <= 0) {
    return { field, message: emptyMessage }
  }
  return null
}

/**
 * Required economics for a live compare. Gross rent and purchase price must
 * be present and greater than zero. Empty, NaN and 0 are all invalid —
 * they must not produce figures or a soft lean.
 */
export function validateLtdCoRequiredFields(values: {
  annualGrossRent: number | null
  purchasePrice: number | null
}): LtdCoValidationIssue | null {
  return (
    requiredPositive(
      values.annualGrossRent,
      "annualGrossRent",
      LTD_CO_GROSS_RENT_REQUIRED,
    ) ??
    requiredPositive(
      values.purchasePrice,
      "purchasePrice",
      LTD_CO_PURCHASE_PRICE_REQUIRED,
    )
  )
}

export function validateLtdCoCompareInput(
  input: Pick<LtdCoCompareInput, "deal">,
): LtdCoValidationIssue | null {
  return validateLtdCoRequiredFields({
    annualGrossRent: input.deal.annualGrossRent,
    purchasePrice: input.deal.purchasePrice,
  })
}

export function validateLtdCoFormFields(fields: {
  annualGrossRent: string
  purchasePrice: string
}): LtdCoValidationIssue | null {
  return validateLtdCoRequiredFields({
    annualGrossRent: parseLtdCoAmount(fields.annualGrossRent),
    purchasePrice: parseLtdCoAmount(fields.purchasePrice),
  })
}
