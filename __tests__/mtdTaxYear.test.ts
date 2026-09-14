import { describe, expect, test } from "vitest"
import {
  currentTaxYear,
  parseQuarterParam,
  parseTaxYear,
  quarterFromDate,
  quarterPeriod,
  taxYearFromDate,
  toIsoDate,
} from "@/lib/mtd/taxYear"

describe("UK tax year / MTD quarters", () => {
  test("6 April starts a new tax year", () => {
    expect(taxYearFromDate(new Date("2025-04-06T00:00:00Z")).taxYear).toBe("2025-26")
    expect(taxYearFromDate(new Date("2025-04-05T00:00:00Z")).taxYear).toBe("2024-25")
  })

  test("parseTaxYear rejects mismatched suffixes", () => {
    expect(parseTaxYear("2025-26")?.startYear).toBe(2025)
    expect(parseTaxYear("2025-27")).toBeNull()
  })

  test("quarters match HMRC ITSA dates", () => {
    const q1 = quarterPeriod("2025-26", 1)!
    expect(toIsoDate(q1.start)).toBe("2025-04-06")
    expect(toIsoDate(q1.end)).toBe("2025-07-05")

    const q2 = quarterPeriod("2025-26", 2)!
    expect(toIsoDate(q2.start)).toBe("2025-07-06")
    expect(toIsoDate(q2.end)).toBe("2025-10-05")

    const q3 = quarterPeriod("2025-26", 3)!
    expect(toIsoDate(q3.start)).toBe("2025-10-06")
    expect(toIsoDate(q3.end)).toBe("2026-01-05")

    const q4 = quarterPeriod("2025-26", 4)!
    expect(toIsoDate(q4.start)).toBe("2026-01-06")
    expect(toIsoDate(q4.end)).toBe("2026-04-05")

    const year = quarterPeriod("2025-26", "year")!
    expect(toIsoDate(year.start)).toBe("2025-04-06")
    expect(toIsoDate(year.end)).toBe("2026-04-05")
  })

  test("quarterFromDate lands in Q1 on 6 April", () => {
    expect(quarterFromDate(new Date("2025-04-06T12:00:00Z"))).toEqual({
      taxYear: "2025-26",
      quarter: 1,
    })
    expect(quarterFromDate(new Date("2026-01-06T12:00:00Z"))).toEqual({
      taxYear: "2025-26",
      quarter: 4,
    })
  })

  test("parseQuarterParam", () => {
    expect(parseQuarterParam("2")).toBe(2)
    expect(parseQuarterParam("year")).toBe("year")
    expect(parseQuarterParam("5")).toBeNull()
  })

  test("currentTaxYear is a labelled period", () => {
    const ty = currentTaxYear(new Date("2026-03-01T00:00:00Z"))
    expect(ty.taxYear).toBe("2025-26")
  })
})
