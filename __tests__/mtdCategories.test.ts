import { describe, expect, test } from "vitest"
import {
  SA105_CATEGORIES,
  getCategory,
  isCategoryId,
  isResidentialFinance,
  matchCategory,
} from "@/lib/mtd/categories"

describe("Flask SA105 categories", () => {
  test("codes are unique", () => {
    const codes = SA105_CATEGORIES.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  test("known boxes match Flask catalogue", () => {
    expect(getCategory("uk_rent_income")?.sa105Box).toBe("20")
    expect(getCategory("premises_running_costs")?.sa105Box).toBe("24")
    expect(getCategory("repairs_and_maintenance")?.sa105Box).toBe("25")
    expect(getCategory("non_residential_finance_costs")?.sa105Box).toBe("26")
    expect(getCategory("professional_fees")?.sa105Box).toBe("27")
    expect(getCategory("cost_of_services")?.sa105Box).toBe("28")
    expect(getCategory("residential_finance_costs")?.sa105Box).toBe("44")
    expect(getCategory("residential_finance_costs_bf")?.sa105Box).toBe("45")
    expect(getCategory("replacing_domestic_items")?.sa105Box).toBe("37")
  })

  test("residential finance is not SA105 box 26", () => {
    expect(getCategory("residential_finance_costs")?.sa105Box).not.toBe("26")
    expect(getCategory("non_residential_finance_costs")?.sa105Box).toBe("26")
    expect(isResidentialFinance("residential_finance_costs")).toBe(true)
    expect(isResidentialFinance("non_residential_finance_costs")).toBe(false)
  })

  test("isCategoryId rejects unknown slugs including the old Next ids", () => {
    expect(isCategoryId("uk_rent_income")).toBe(true)
    expect(isCategoryId("rent")).toBe(false)
    expect(isCategoryId("financial_costs")).toBe(false)
    expect(isCategoryId("not-a-category")).toBe(false)
  })

  test("matchCategory maps aliases, boxes, and descriptions", () => {
    expect(matchCategory("uk_rent_income")).toBe("uk_rent_income")
    expect(matchCategory("rent")).toBe("uk_rent_income")
    expect(matchCategory("Box 24")).toBe("premises_running_costs")
    expect(matchCategory("mortgage interest")).toBe("residential_finance_costs")
    expect(matchCategory("Box 26")).toBe("non_residential_finance_costs")
    expect(matchCategory("mystery widget")).toBeNull()
  })
})
