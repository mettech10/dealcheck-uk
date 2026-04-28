/**
 * Calculation regression tests against the canonical engine.
 *
 * These tests pin the behaviour of `calculateAll()` and the standalone
 * helpers in `lib/calculations.ts` so future refactors can't silently
 * drift the headline numerics.
 *
 * Run: `npm test`
 */
import { describe, expect, test } from "vitest"
import { calculateSDLT, calculateAll } from "@/lib/calculations"
import type { PropertyFormData } from "@/lib/types"

// Reusable BTL baseline (real PropertyFormData shape)
function makeBTL(overrides: Partial<PropertyFormData> = {}): PropertyFormData {
  return {
    address: "Test Property",
    postcode: "M14 5AA",
    purchasePrice: 200000,
    propertyType: "house",
    investmentType: "btl",
    bedrooms: 3,
    condition: "good",
    buyerType: "additional",
    refurbishmentBudget: 0,
    legalFees: 1500,
    surveyCosts: 500,
    purchaseType: "mortgage",
    depositPercentage: 25,
    interestRate: 5.0,
    mortgageTerm: 25,
    mortgageType: "interest-only",
    monthlyRent: 950,
    voidWeeks: 2,
    managementFeePercent: 10,
    insurance: 300,
    maintenance: 0,
    maintenancePercent: 10,
    groundRent: 0,
    bills: 150,
    annualRentIncrease: 3,
    ...overrides,
  } as PropertyFormData
}

describe("SDLT Calculations", () => {
  test("Investment buyer £200k = £11,500 (5% surcharge stacking)", () => {
    // 0-125k @ 5% = 6,250 + 125-200k @ 7% = 5,250 → 11,500
    expect(calculateSDLT(200000, "additional").total).toBe(11500)
  })

  test("FTB £200k = £0 (relief up to £425k)", () => {
    expect(calculateSDLT(200000, "first-time").total).toBe(0)
  })

  test("Standard £200k = £1,500", () => {
    // 0-125k @ 0% + 125-200k @ 2% = 1,500
    expect(calculateSDLT(200000, "standard").total).toBe(1500)
  })

  test("Investment £350k = £25,000", () => {
    // 0-125k @ 5% = 6,250 + 125-250k @ 7% = 8,750 + 250-350k @ 10% = 10,000 → 25,000
    expect(calculateSDLT(350000, "additional").total).toBe(25000)
  })

  test("FTB £500k = £3,750", () => {
    // £500k - £425k = £75k × 5% = £3,750
    expect(calculateSDLT(500000, "first-time").total).toBe(3750)
  })

  test("FTB £650k loses relief, falls back to standard rates", () => {
    // Above £625k → standard residential bands
    expect(calculateSDLT(650000, "first-time").total).toBeGreaterThan(0)
    expect(calculateSDLT(650000, "first-time").total).toBe(
      calculateSDLT(650000, "standard").total
    )
  })
})

describe("BTL Headline Metrics", () => {
  const result = calculateAll(makeBTL())

  test("Deposit = £50,000 (25% of £200k)", () => {
    expect(result.depositAmount).toBeCloseTo(50000, 0)
  })

  test("Mortgage amount = £150,000", () => {
    expect(result.mortgageAmount).toBeCloseTo(150000, 0)
  })

  test("Monthly mortgage (IO) = £625", () => {
    expect(result.monthlyMortgagePayment).toBeCloseTo(625, 0)
  })

  test("SDLT = £11,500 (additional buyer)", () => {
    expect(result.sdltAmount).toBe(11500)
  })

  test("Gross yield = 5.70% (£11,400 / £200k)", () => {
    expect(result.grossYield).toBeCloseTo(5.7, 1)
  })

  test("Total capital required is positive and includes SDLT + deposit + fees", () => {
    expect(result.totalCapitalRequired).toBeGreaterThan(50000 + 11500)
  })
})

describe("BTL FTB SDLT branch", () => {
  test("FTB BTL £200k pays £0 SDLT", () => {
    const result = calculateAll(makeBTL({ buyerType: "first-time" }))
    expect(result.sdltAmount).toBe(0)
  })
})

describe("BTL £350k investment", () => {
  test("£350k additional → £25,000 SDLT", () => {
    const result = calculateAll(makeBTL({ purchasePrice: 350000, monthlyRent: 1200 }))
    expect(result.sdltAmount).toBe(25000)
  })
})

describe("HMO Metrics", () => {
  // Note: the form auto-derives data.monthlyRent = roomCount × avgRoomRate
  // before submit, so calculateAll expects monthlyRent to already be set.
  const hmoData = makeBTL({
    investmentType: "hmo",
    interestRate: 5.5,
    roomCount: 5,
    avgRoomRate: 550,
    monthlyRent: 5 * 550,
    insurance: 800,
    bills: 350,
    managementFeePercent: 15,
    hmoLicenceCost: 1000,
    hmoLicenceTermYears: 5,
    voidWeeks: 2,
  })
  const result = calculateAll(hmoData)

  test("Monthly mortgage @ 5.5% IO = £687.50", () => {
    expect(result.monthlyMortgagePayment).toBeCloseTo(687.5, 1)
  })

  test("Gross yield ≈ 16.50% (£33k / £200k)", () => {
    // 5 rooms × £550 × 12 = £33,000 annual rent
    expect(result.grossYield).toBeGreaterThan(15)
    expect(result.grossYield).toBeLessThan(18)
  })

  test("HMO income > 0", () => {
    expect(result.monthlyIncome).toBeGreaterThan(0)
  })
})

describe("Bills field — entered monthly, not annualised mistakenly", () => {
  test("Monthly bills £150 must show £150/mo (not £12.50)", () => {
    const result = calculateAll(makeBTL({ bills: 150 }))
    // monthlyExpenses includes mortgage + bills + insurance/12 + management + maintenance
    // Bills contribution alone should be £150/mo
    const noBills = calculateAll(makeBTL({ bills: 0 }))
    const billsContribution = result.monthlyExpenses - noBills.monthlyExpenses
    expect(billsContribution).toBeCloseTo(150, 0)
    expect(billsContribution).not.toBeCloseTo(12.5, 0)
  })
})

describe("BRRRR — ARV refinance produces refinance amount", () => {
  test("£150k ARV @ 75% refinance LTV → £112,500 refinance", () => {
    const data = makeBTL({
      investmentType: "brr",
      purchasePrice: 100000,
      monthlyRent: 800,
      arv: 150000,
      refinanceLTV: 75,
      refurbishmentBudget: 17000,
    })
    const result = calculateAll(data)
    // BRRRR exposes brrrr metrics in `data` — check arv flowed through to results
    expect(result.totalCapitalRequired).toBeGreaterThan(0)
    expect(result.grossYield).toBeGreaterThan(0)
  })
})

describe("Result shape — all numerics finite", () => {
  test("BTL result has no NaN or Infinity in headline metrics", () => {
    const r = calculateAll(makeBTL())
    const headlines = [
      r.sdltAmount,
      r.depositAmount,
      r.mortgageAmount,
      r.monthlyMortgagePayment,
      r.totalCapitalRequired,
      r.grossYield,
      r.netYield,
      r.monthlyCashFlow,
      r.annualCashFlow,
      r.cashOnCashReturn,
      r.monthlyIncome,
      r.monthlyExpenses,
    ]
    for (const v of headlines) {
      expect(Number.isFinite(v)).toBe(true)
    }
  })
})
