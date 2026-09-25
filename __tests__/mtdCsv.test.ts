import { describe, expect, test } from "vitest"
import { readFileSync } from "node:fs"
import { CSV_TEMPLATE_HEADERS, csvTemplate, injectPropertyId } from "@/lib/mtd/csv"
import { csvPreviewRowStatus } from "@/lib/mtd/csv-preview"

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

  test("csv import preview renders Flask alreadyImported flags", () => {
    const src = readFileSync("components/mtd/csv-import.tsx", "utf8")
    expect(src).toContain("csvPreviewRowStatus")
    expect(src).toContain("alreadyImportedFile")
    expect(src).toContain("Already imported")
    expect(csvPreviewRowStatus({
      rowNumber: 2,
      valid: true,
      errors: [],
      alreadyImported: true,
      mapped: {},
    })).toBe("Already imported")
  })

  test("FE PR includes Flask format-patch for pack PDF/CSV/preview", () => {
    const patch = readFileSync("patches/metusa-deal-analyzer-mtd-polish.patch", "utf8")
    expect(patch).toContain("mtd/pdf.py")
    expect(patch).toContain("wrap_text")
    expect(patch).toContain("alreadyImported")
    expect(patch).toContain("periodPounds")
    expect(patch).toContain("tax reducer, not a deductible expense")
  })
})
