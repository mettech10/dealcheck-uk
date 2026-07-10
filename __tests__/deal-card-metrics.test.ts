/**
 * Pins the share-card helpers: getAreaLabel must NEVER leak the street
 * address, and getCardMetrics must pick strategy-appropriate metrics.
 */
import { describe, expect, test } from "vitest"
import {
  getAreaLabel,
  getCardMetrics,
  getStrategyLabel,
} from "@/lib/dealCardMetrics"
import { calculateAll } from "@/lib/calculations"
import type { PropertyFormData } from "@/lib/types"

function makeForm(overrides: Partial<PropertyFormData> = {}): PropertyFormData {
  return {
    address: "14 Cardigan Road, Headingley, Leeds",
    postcode: "LS6 3AA",
    purchasePrice: 230000,
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
    interestRate: 5.5,
    mortgageTerm: 25,
    mortgageType: "interest-only",
    monthlyRent: 1150,
    voidWeeks: 2,
    managementFeePercent: 8,
    insurance: 300,
    maintenance: 0,
    maintenancePercent: 5,
    groundRent: 0,
    bills: 0,
    annualRentIncrease: 3,
    ...overrides,
  } as PropertyFormData
}

describe("getAreaLabel — privacy", () => {
  test("city + district only, never the street", () => {
    const label = getAreaLabel("14 Cardigan Road, Headingley, Leeds", "LS6 3AA")
    expect(label).toBe("Leeds, LS6")
    expect(label).not.toMatch(/Cardigan/)
    expect(label).not.toMatch(/14/)
  })

  test("never includes the incode", () => {
    expect(getAreaLabel("Flat 2, 9 High St, Manchester", "M14 5AA")).not.toMatch(/5AA/)
  })

  test("district-only fallback when address is empty", () => {
    expect(getAreaLabel("", "WN2 2LQ")).toBe("WN2")
  })

  test("generic fallback when nothing usable", () => {
    expect(getAreaLabel("", "")).toBe("UK Property")
  })
})

describe("getCardMetrics — strategy-aware", () => {
  test("BTL shows yield/cashflow/price quartet", () => {
    const form = makeForm()
    const metrics = getCardMetrics(form, calculateAll(form))
    expect(metrics.map((m) => m.label)).toEqual([
      "Gross Yield",
      "Monthly Cashflow",
      "Purchase Price",
      "Net Yield",
    ])
    expect(metrics).toHaveLength(4)
  })

  test("HMO shows rooms + gross rent, not BTL labels", () => {
    const form = makeForm({
      investmentType: "hmo",
      roomCount: 5,
      monthlyRent: 2750,
    } as Partial<PropertyFormData>)
    const labels = getCardMetrics(form, calculateAll(form)).map((m) => m.label)
    expect(labels).toContain("Rooms")
    expect(labels).toContain("HMO Gross Yield")
    expect(labels).not.toContain("Purchase Price")
  })

  test("flip shows profit/ROI, no rent metrics", () => {
    const form = makeForm({
      investmentType: "flip",
      arv: 300000,
      refurbishmentBudget: 35000,
      flipHoldingMonths: 6,
    } as Partial<PropertyFormData>)
    const labels = getCardMetrics(form, calculateAll(form)).map((m) => m.label)
    expect(labels).toContain("Net Profit")
    expect(labels).toContain("Flip ROI")
    expect(labels).not.toContain("Monthly Cashflow")
  })
})

describe("getStrategyLabel", () => {
  test("maps internal keys to display labels", () => {
    expect(getStrategyLabel("btl")).toBe("BTL")
    expect(getStrategyLabel("brr")).toBe("BRRRR")
    expect(getStrategyLabel("r2sa")).toBe("SA")
  })
})
