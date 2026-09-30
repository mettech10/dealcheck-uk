import { expect, test } from "vitest"
import { vacancyPercent, vacancyWeeks } from "@/lib/sensitivity"
import { calculateAll } from "@/lib/calculations"
import type { PropertyFormData } from "@/lib/types"

test.each([0, 2, 2.25, 12])("unchanged scenario retains %s void weeks", (weeks) => {
  expect(vacancyWeeks(vacancyPercent(weeks))).toBeCloseTo(weeks, 12)
})

test("zero-vacancy BTL remains £150 cashflow after running the initial scenario", () => {
  const data = {
    purchasePrice: 200000, buyerType: "additional", investmentType: "btl",
    purchaseType: "mortgage", depositPercentage: 25, interestRate: 5,
    mortgageTerm: 25, mortgageType: "interest-only", monthlyRent: 1000,
    voidWeeks: 0, managementFeePercent: 10, maintenancePercent: 10,
    maintenance: 0, insurance: 300, groundRent: 0, bills: 0,
    refurbishmentBudget: 0, legalFees: 1500, surveyCosts: 500,
    annualRentIncrease: 0, capitalGrowthRate: 0,
  } as PropertyFormData
  const base = calculateAll(data)
  const scenario = calculateAll({ ...data, voidWeeks: vacancyWeeks(vacancyPercent(data.voidWeeks)) })
  expect(base.monthlyCashFlow).toBe(150)
  expect(scenario).toEqual(base)
})
