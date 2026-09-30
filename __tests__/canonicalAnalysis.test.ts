import { expect, test } from "vitest"
import { canonicalAnalysis } from "@/lib/canonical-analysis"

const inputs = {
  address: "QA synthetic property", postcode: "M14 5AA", propertyType: "house",
  bedrooms: 3, condition: "good", purchasePrice: 200000,
  buyerType: "additional", investmentType: "btl", purchaseType: "mortgage",
  depositPercentage: 25, interestRate: 5, mortgageTerm: 25,
  mortgageType: "interest-only", monthlyRent: 1000, voidWeeks: 0,
  managementFeePercent: 10, maintenancePercent: 10, maintenance: 0,
  insurance: 300, groundRent: 0, bills: 0, refurbishmentBudget: 0,
  legalFees: 1500, surveyCosts: 500, annualRentIncrease: 0, capitalGrowthRate: 0,
}

test("tampered client totals cannot change server results", () => {
  const result = canonicalAnalysis({ propertyData: inputs, calculationResults: { grossYield: 99, monthlyCashFlow: 99999, sdltAmount: 0 } })
  expect(result.success).toBe(true)
  if (!result.success) throw new Error(result.error)
  expect(result.calculationResults).toMatchObject({ grossYield: 6, monthlyCashFlow: 150, sdltAmount: 11500, totalCapitalRequired: 63500 })
})
test.each([{ purchasePrice: -1 }, { interestRate: 99 }, { voidWeeks: 53 }, { monthlyRent: "not a number" }])("invalid assumptions are rejected: %j", (change) => {
  expect(canonicalAnalysis({ propertyData: { ...inputs, ...change } }).success).toBe(false)
})
test("mixed-use acquisition retains commercial SDLT server-side", () => {
  const result = canonicalAnalysis({ propertyData: { ...inputs, purchasePrice: 350000, sdltRateType: "mixed-use" } })
  expect(result.success && result.calculationResults.sdltAmount).toBe(7000)
})
test.each(["btl", "hmo", "brr", "flip", "r2sa", "development"])("%s can be calculated by the server engine", (investmentType) => {
  const result = canonicalAnalysis({ propertyData: { ...inputs, investmentType, arv: 280000 } })
  expect(result.success).toBe(true)
})
