import { describe, expect, test } from "vitest"
import {
  SA105_CATEGORIES,
  getCategory,
  isCategoryId,
  matchCategory,
} from "@/lib/mtd/categories"

describe("SA105 categories", () => {
  test("ids are unique", () => {
    const ids = SA105_CATEGORIES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("known boxes are present", () => {
    expect(getCategory("rent")?.sa105Box).toBe("21")
    expect(getCategory("premises_running_costs")?.sa105Box).toBe("24")
    expect(getCategory("repairs_and_maintenance")?.sa105Box).toBe("25")
    expect(getCategory("financial_costs")?.sa105Box).toBe("26")
    expect(getCategory("professional_fees")?.sa105Box).toBe("27")
    expect(getCategory("cost_of_services")?.sa105Box).toBe("28")
    expect(getCategory("other_expenses")?.sa105Box).toBe("29")
    expect(getCategory("residential_finance_cost")?.sa105Box).toBe("44")
    expect(getCategory("replacement_domestic_items")?.sa105Box).toBe("37")
  })

  test("isCategoryId rejects unknown slugs", () => {
    expect(isCategoryId("rent")).toBe(true)
    expect(isCategoryId("not-a-category")).toBe(false)
  })

  test("matchCategory maps aliases, boxes, and descriptions", () => {
    expect(matchCategory("rent")).toBe("rent")
    expect(matchCategory("Box 24")).toBe("premises_running_costs")
    expect(matchCategory("Letting agent management fee")).toBe("professional_fees")
    expect(matchCategory("Buildings insurance")).toBe("premises_running_costs")
    expect(matchCategory("mystery widget")).toBeNull()
  })
})
