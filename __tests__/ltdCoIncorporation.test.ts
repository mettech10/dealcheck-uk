import { describe, expect, test } from "vitest"
import {
  DEFAULT_INCORPORATION_INPUT,
  toIncorporationPayload,
  validateIncorporationInput,
} from "@/lib/ltdCoIncorporation"

describe("toIncorporationPayload", () => {
  test("maps the form to Flask's shape with rates as decimals", () => {
    const p = toIncorporationPayload(DEFAULT_INCORPORATION_INPUT) as {
      property: Record<string, number>
      financing: Record<string, number>
      reliefs: Record<string, boolean>
      discountRate: number
    }
    expect(p.property.marketValue).toBe(250_000)
    expect(p.financing.outstandingMortgage).toBe(187_500)
    expect(p.financing.personalInterestRate).toBeCloseTo(0.045)
    expect(p.financing.companyInterestRate).toBeCloseTo(0.055)
    expect(p.discountRate).toBeCloseTo(0.05)
    // Reliefs are fact-dependent, so they default off.
    expect(p.reliefs).toEqual({ incorporationRelief: false, partnershipSdltRelief: false })
  })
})

describe("validateIncorporationInput", () => {
  test("accepts the defaults", () => {
    expect(validateIncorporationInput(DEFAULT_INCORPORATION_INPUT)).toBeNull()
  })

  test.each([
    [{ marketValue: 0 }, /worth today/],
    [{ originalPurchasePrice: 0 }, /what you paid/],
    [{ monthlyRent: 0 }, /monthly rent/],
    [{ outstandingMortgage: 300_000 }, /mortgage can't be more/],
  ])("rejects %o", (patch, message) => {
    expect(validateIncorporationInput({ ...DEFAULT_INCORPORATION_INPUT, ...patch })).toMatch(message)
  })
})
