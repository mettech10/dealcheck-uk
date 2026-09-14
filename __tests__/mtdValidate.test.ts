import { describe, expect, test } from "vitest"
import { validateLedgerInput, isUuid } from "@/lib/mtd/validate"

describe("ledger input validation", () => {
  const good = {
    propertyId: "11111111-1111-4111-8111-111111111111",
    entryDate: "2025-04-06",
    amount: 12.5,
    categoryId: "rent",
    description: "April rent",
  }

  test("accepts a valid row keyed by propertyId", () => {
    const result = validateLedgerInput(good)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.propertyId).toBe(good.propertyId)
      expect(result.value.amount).toBe(12.5)
    }
  })

  test("requires propertyId UUID (source of truth)", () => {
    expect(validateLedgerInput({ ...good, propertyId: "14 Acacia" }).ok).toBe(false)
    expect(isUuid(good.propertyId)).toBe(true)
  })

  test("rejects unknown categories and non-positive amounts", () => {
    expect(validateLedgerInput({ ...good, categoryId: "widgets" }).ok).toBe(false)
    expect(validateLedgerInput({ ...good, amount: 0 }).ok).toBe(false)
  })
})
