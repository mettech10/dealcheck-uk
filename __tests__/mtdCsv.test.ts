import { describe, expect, test } from "vitest"
import { CSV_TEMPLATE_HEADERS, csvTemplate, injectPropertyId } from "@/lib/mtd/csv"

describe("Flask MTD CSV", () => {
  test("template uses Flask columns (property_id + amount_pence)", () => {
    expect(CSV_TEMPLATE_HEADERS).toEqual([
      "date",
      "property_id",
      "category",
      "amount_pence",
      "description",
      "counterparty",
    ])
    const csv = csvTemplate()
    expect(csv).toContain("property_id")
    expect(csv).toContain("amount_pence")
    expect(csv).toContain("uk_rent_income")
    expect(csv).toContain("mortgage interest")
    expect(csv).not.toContain("amount,")
  })

  test("injectPropertyId fills blank property_id cells with the platform UUID", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const csv = `date,property_id,category,amount_pence,description\n2026-04-10,,uk_rent_income,125000,April rent\n`
    const injected = injectPropertyId(csv, id)
    expect(injected).toContain(id)
    expect(injected.split("\n")[1]).toContain(id)
  })

  test("injectPropertyId appends a property_id column when missing", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const csv = `date,category,amount_pence,description\n2026-04-10,uk_rent_income,125000,April rent`
    const injected = injectPropertyId(csv, id)
    expect(injected.split("\n")[0]).toMatch(/property_id/)
    expect(injected.split("\n")[1]).toContain(id)
  })
})
