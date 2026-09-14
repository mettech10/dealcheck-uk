/**
 * Personal vs Ltd Co comparison engine — pinned regression cases.
 *
 * Run: `npm test`
 */
import { describe, expect, test } from "vitest"
import {
  assessUkIncomeTax,
  BANNED_LEAN_PHRASES,
  breakEvenYear,
  comparePersonalVsLtd,
  corporationTaxOn,
  DEFAULT_LTD_CO_INPUT,
  incrementalIncomeTax,
  leanContainsBannedPhrase,
  LTD_CO_TAX_YEAR,
  npvOf,
  personalAllowanceFor,
  type LtdCoCompareInput,
} from "@/lib/ltdCoCompare"

function input(overrides: {
  deal?: Partial<LtdCoCompareInput["deal"]>
  personal?: Partial<LtdCoCompareInput["personal"]>
  company?: Partial<LtdCoCompareInput["company"]>
  horizon?: Partial<LtdCoCompareInput["horizon"]>
  mode?: LtdCoCompareInput["mode"]
}): LtdCoCompareInput {
  return {
    mode: overrides.mode ?? "landlord",
    deal: { ...DEFAULT_LTD_CO_INPUT.deal, ...overrides.deal },
    personal: { ...DEFAULT_LTD_CO_INPUT.personal, ...overrides.personal },
    company: { ...DEFAULT_LTD_CO_INPUT.company, ...overrides.company },
    horizon: { ...DEFAULT_LTD_CO_INPUT.horizon, ...overrides.horizon },
  }
}

describe("UK income tax (E&NI 2026/27)", () => {
  test("personal allowance tapers from £100k and is gone at £125,140", () => {
    expect(personalAllowanceFor(50_000)).toBe(12_570)
    expect(personalAllowanceFor(100_000)).toBe(12_570)
    expect(personalAllowanceFor(110_000)).toBe(7_570)
    expect(personalAllowanceFor(125_140)).toBe(0)
  })

  test("£50,270 of earned income is the higher-rate threshold (20% only)", () => {
    // PA 12,570 + basic band 37,700 = 50,270. Tax = 37,700 × 20% = 7,540
    expect(assessUkIncomeTax(50_270).incomeTax).toBe(7_540)
  })

  test("incremental tax on £20k property profit for a £60k earner is 40%", () => {
    expect(incrementalIncomeTax(60_000, 20_000)).toBe(8_000)
  })
})

describe("Corporation tax", () => {
  test("£10,500 profit is small-profits rate 19%", () => {
    expect(corporationTaxOn(10_500)).toBe(1_995)
  })

  test("£100,000 profit uses marginal relief", () => {
    // 100000 × 25% − (250000 − 100000) × 3/200 = 25000 − 2250 = 22750
    expect(corporationTaxOn(100_000)).toBe(22_750)
  })

  test("£250,000+ is main rate 25%", () => {
    expect(corporationTaxOn(250_000)).toBe(62_500)
  })
})

describe("comparePersonalVsLtd — higher-rate landlord fixture", () => {
  const fixture = input({
    deal: {
      annualGrossRent: 24_000,
      annualOperatingCosts: 4_000,
      annualFinanceCosts: 8_000,
      rentGrowthPercent: 0,
      costGrowthPercent: 0,
      financeGrowthPercent: 0,
    },
    personal: { otherTaxableIncome: 60_000, region: "england-ni" },
    company: {
      associatedCompanies: 0,
      annualAccountancyCost: 1_500,
      otherCompanyProfits: 0,
      setupCostYear1: 0,
    },
    horizon: { years: 10, discountRatePercent: 5 },
  })

  test("year-1 personal after-tax is £5,600 (s.24 20% reducer)", () => {
    // Profit 20k @ 40% = 8,000; s.24 credit 8,000 × 20% = 1,600; tax 6,400
    // Cash = 24k − 4k − 8k − 6,400 = 5,600
    const r = comparePersonalVsLtd(fixture)
    expect(r.personal.year1AfterTax).toBe(5_600)
    expect(r.years[0].personalTax).toBe(6_400)
  })

  test("year-1 Ltd retained is ahead of personal (CT 19% on residual)", () => {
    // Ltd profit 24k − 4k − 8k − 1.5k = 10,500; CT 1,995; retained 8,505
    const r = comparePersonalVsLtd(fixture)
    expect(r.retained.year1AfterTax).toBe(8_505)
    expect(r.years[0].ltdCorporationTax).toBe(1_995)
    expect(r.retained.year1AfterTax).toBeGreaterThan(r.personal.year1AfterTax)
  })

  test("extracted lens is lower than retained (dividend tax)", () => {
    const r = comparePersonalVsLtd(fixture)
    expect(r.extracted.year1AfterTax).toBeLessThan(r.retained.year1AfterTax)
    expect(r.years[0].ltdDividendTax).toBeGreaterThan(0)
  })

  test("cumulative and NPV are populated for both lenses", () => {
    const r = comparePersonalVsLtd(fixture)
    expect(r.years).toHaveLength(10)
    expect(r.retained.cumulative).toBe(r.years[9].ltdRetainedCumulative)
    expect(r.extracted.cumulative).toBe(r.years[9].ltdExtractedCumulative)
    expect(r.personal.npv).toBeGreaterThan(0)
    expect(r.retained.npv).toBeGreaterThan(r.personal.npv)
  })

  test("retained break-even is year 1 when Ltd is ahead immediately", () => {
    const r = comparePersonalVsLtd(fixture)
    expect(r.retained.breakEvenYear).toBe(1)
  })
})

describe("comparePersonalVsLtd — basic-rate modest deal", () => {
  test("personal can beat Ltd once accountancy is in the stack", () => {
    const r = comparePersonalVsLtd(
      input({
        deal: {
          annualGrossRent: 12_000,
          annualOperatingCosts: 2_000,
          annualFinanceCosts: 3_000,
          rentGrowthPercent: 0,
          costGrowthPercent: 0,
          financeGrowthPercent: 0,
        },
        personal: { otherTaxableIncome: 20_000, region: "england-ni" },
        company: {
          associatedCompanies: 0,
          annualAccountancyCost: 1_500,
          otherCompanyProfits: 0,
          setupCostYear1: 0,
        },
        horizon: { years: 5, discountRatePercent: 5 },
      }),
    )
    expect(r.personal.year1AfterTax).toBeGreaterThan(r.retained.year1AfterTax)
    expect(r.personal.year1AfterTax).toBeGreaterThan(r.extracted.year1AfterTax)
    expect(r.retained.lean).toBe("personal")
    expect(r.extracted.lean).toBe("personal")
  })
})

describe("Scotland / Wales flag only", () => {
  test("Scotland does not change the numeric result vs E&NI, but flags", () => {
    const base = input({
      personal: { otherTaxableIncome: 50_000, region: "england-ni" },
    })
    const sco = input({
      personal: { otherTaxableIncome: 50_000, region: "scotland" },
    })
    const a = comparePersonalVsLtd(base)
    const b = comparePersonalVsLtd(sco)
    expect(a.personal.year1AfterTax).toBe(b.personal.year1AfterTax)
    expect(a.retained.cumulative).toBe(b.retained.cumulative)
    expect(b.flags.devolvedNation).toBe(true)
    expect(b.flags.devolvedNationNote).toMatch(/Scotland/)
    expect(a.flags.devolvedNation).toBe(false)
  })

  test("Wales sets the devolved flag without a separate tax model", () => {
    const r = comparePersonalVsLtd(
      input({ personal: { otherTaxableIncome: 40_000, region: "wales" } }),
    )
    expect(r.flags.devolvedNation).toBe(true)
    expect(r.flags.devolvedNationNote).toMatch(/Wales/)
  })
})

describe("Soft lean — never 'incorporate now'", () => {
  test("every lean copy is free of banned phrases", () => {
    const cases: LtdCoCompareInput[] = [
      input({}),
      input({
        personal: { otherTaxableIncome: 80_000, region: "england-ni" },
      }),
      input({
        personal: { otherTaxableIncome: 18_000, region: "england-ni" },
      }),
      input({
        deal: {
          ...DEFAULT_LTD_CO_INPUT.deal,
          annualGrossRent: 80_000,
          annualOperatingCosts: 10_000,
          annualFinanceCosts: 20_000,
        },
      }),
    ]
    for (const c of cases) {
      const r = comparePersonalVsLtd(c)
      expect(leanContainsBannedPhrase(r.retained.copy)).toBe(false)
      expect(leanContainsBannedPhrase(r.extracted.copy)).toBe(false)
      expect(leanContainsBannedPhrase(r.personal.copy)).toBe(false)
      for (const phrase of BANNED_LEAN_PHRASES) {
        expect(r.retained.copy.toLowerCase()).not.toContain(phrase)
        expect(r.extracted.copy.toLowerCase()).not.toContain(phrase)
      }
    }
  })

  test("disclaimer is educational only", () => {
    const r = comparePersonalVsLtd(input({}))
    expect(r.flags.educationalOnly).toBe(true)
    expect(r.disclaimer.toLowerCase()).toContain("not tax, legal or financial advice")
    expect(r.taxYear).toBe(LTD_CO_TAX_YEAR)
  })
})

describe("Broker mode is structure-only", () => {
  test("broker mode still returns landlord numbers plus unavailable slots", () => {
    const r = comparePersonalVsLtd(input({ mode: "broker" }))
    expect(r.mode).toBe("broker")
    expect(r.broker.enabled).toBe(false)
    expect(r.broker.slots.clientPack.status).toBe("unavailable")
    expect(r.broker.slots.multiDealOverlay.status).toBe("unavailable")
    expect(r.broker.slots.adviserNotes.status).toBe("unavailable")
    expect(r.years.length).toBeGreaterThan(0)
  })
})

describe("helpers", () => {
  test("NPV of a £1,000 perpetuity-style 1-year flow at 0% is £1,000", () => {
    expect(npvOf([1000], 0)).toBe(1000)
  })

  test("break-even is the first year Ltd cumulative exceeds personal", () => {
    expect(breakEvenYear([10, 30, 60], [20, 40, 50])).toBe(3)
    expect(breakEvenYear([10, 20], [30, 40])).toBeNull()
    expect(breakEvenYear([50], [10])).toBe(1)
  })
})
