import { expect, test } from "vitest"
import { finalizeAnalysis, narrativeConflicts } from "@/lib/finalize-analysis"
import { calculateAll } from "@/lib/calculations"
import type { PropertyFormData } from "@/lib/types"

test("audit's impossible benchmark comparison is withheld", () => {
  expect(narrativeConflicts("Gross yield of 6.00% technically meets the minimum 6.0733% national BTL benchmark", 44)).toBe(true)
  expect(narrativeConflicts("Gross yield of 6.00% is below the 6.0733% benchmark", 44)).toBe(false)
  expect(narrativeConflicts("Gross yield of 6.00% exceeds the 4.75% benchmark", 44)).toBe(false)
})
test("conflicting score is rejected, including zero-valued scores", () => {
  expect(narrativeConflicts("This deal scores 11/100.", 44)).toBe(true)
  expect(narrativeConflicts("This deal scores 44/100.", 44)).toBe(false)
  expect(narrativeConflicts("This deal scores 0/100.", 0)).toBe(false)
})
test("one score snapshot drives numeric fields and replacement narrative", () => {
  const data = { address: "QA", postcode: "M14 5AA", investmentType: "btl", purchasePrice: 200000, buyerType: "additional", purchaseType: "mortgage", depositPercentage: 25, interestRate: 5, mortgageTerm: 25, mortgageType: "interest-only", monthlyRent: 1000, voidWeeks: 0, managementFeePercent: 10, maintenancePercent: 10, maintenance: 0, insurance: 300, groundRent: 0, bills: 0, refurbishmentBudget: 0, legalFees: 1500, surveyCosts: 500, annualRentIncrease: 0 } as PropertyFormData
  const result = finalizeAnalysis(data, calculateAll(data), { deal_score: 999, ai_verdict: "This deal scores 999/100.", ai_strengths: ["6.00% meets the 6.0733% benchmark", "Verify local demand."] })
  expect(result.deal_score).toBe(result.canonical_score?.total)
  expect(result.ai_verdict).toContain(`${result.deal_score}/100`)
  expect(result.ai_verdict).not.toContain("999")
  expect(result.ai_strengths).toEqual(["Verify local demand."])
  expect(result.ai_validation_note).toBeTruthy()
})
