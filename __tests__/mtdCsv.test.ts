import { describe, expect, test } from "vitest"
import { csvTemplate, parseCsv, parseLedgerCsv } from "@/lib/mtd/csv"

describe("MTD CSV", () => {
  test("parses quoted commas", () => {
    const rows = parseCsv('date,amount,description\n2025-04-06,100,"Rent, April"\n')
    expect(rows[1]).toEqual(["2025-04-06", "100", "Rent, April"])
  })

  test("maps template rows onto SA105 categories", () => {
    const parsed = parseLedgerCsv(csvTemplate())
    expect(parsed.length).toBe(3)
    expect(parsed[0].categoryId).toBe("rent")
    expect(parsed[1].categoryId).toBe("premises_running_costs")
    expect(parsed[2].categoryId).toBe("professional_fees")
    expect(parsed.every((r) => r.warnings.length === 0)).toBe(true)
  })

  test("accepts UK dates and infers category from description", () => {
    const csv = `date,amount,description\n12/04/2025,850,April rent received\n`
    const [row] = parseLedgerCsv(csv)
    expect(row.entryDate).toBe("2025-04-12")
    expect(row.categoryId).toBe("rent")
    expect(row.amount).toBe(850)
  })

  test("flags unmatched categories", () => {
    const csv = `date,amount,description\n2025-04-06,10,xyz mystery\n`
    const [row] = parseLedgerCsv(csv)
    expect(row.categoryId).toBeNull()
    expect(row.warnings.length).toBeGreaterThan(0)
  })
})
