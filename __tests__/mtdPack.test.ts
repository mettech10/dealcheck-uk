import { describe, expect, test } from "vitest"
import { buildPack, packToCsv } from "@/lib/mtd/pack"
import { MTD_DISCLAIMER } from "@/lib/mtd/disclaimer"
import type { MtdLedgerEntry, MtdProperty } from "@/lib/mtd/types"

const property: MtdProperty = {
  propertyId: "11111111-1111-4111-8111-111111111111",
  nickname: "Manchester BTL",
  address: "14 Acacia Avenue",
  postcode: "M14 5AA",
  strategy: "BTL",
  status: "owned",
}

function entry(partial: Partial<MtdLedgerEntry>): MtdLedgerEntry {
  return {
    id: partial.id ?? "e1",
    user_id: "u1",
    business_id: "b1",
    property_id: property.propertyId,
    entry_date: "2025-04-10",
    amount: 100,
    category_id: "rent",
    description: "Rent",
    reference: null,
    source: "manual",
    created_at: "2025-04-10T00:00:00Z",
    updated_at: "2025-04-10T00:00:00Z",
    ...partial,
  }
}

describe("MTD pack aggregation", () => {
  test("sums one business across properties for Q1 and excludes later dates", () => {
    const entries = [
      entry({ id: "a", amount: 850, category_id: "rent", entry_date: "2025-04-10" }),
      entry({
        id: "b",
        amount: 40,
        category_id: "premises_running_costs",
        entry_date: "2025-04-12",
      }),
      entry({
        id: "c",
        amount: 900,
        category_id: "rent",
        entry_date: "2025-08-01",
      }),
      entry({
        id: "d",
        amount: 200,
        category_id: "rent",
        entry_date: "2025-04-20",
        property_id: "22222222-2222-4222-8222-222222222222",
      }),
    ]
    const pack = buildPack({
      taxYear: "2025-26",
      quarter: 1,
      entries,
      properties: [
        property,
        { ...property, propertyId: "22222222-2222-4222-8222-222222222222", nickname: "Leeds BTL" },
      ],
    })

    expect(pack.hmrcSubmission).toBe(false)
    expect(pack.downloadKind).toBe("working_papers")
    expect(pack.disclaimer).toBe(MTD_DISCLAIMER)
    expect(pack.totals.income).toBe(1050)
    expect(pack.totals.expenses).toBe(40)
    expect(pack.totals.netWorkingPapers).toBe(1010)
    expect(pack.totals.entryCount).toBe(3)
    expect(pack.byProperty).toHaveLength(2)
    expect(pack.byProperty.find((p) => p.propertyId === property.propertyId)?.income).toBe(850)
  })

  test("CSV download is labelled as not an HMRC submission", () => {
    const pack = buildPack({
      taxYear: "2025-26",
      quarter: "year",
      entries: [entry({})],
      properties: [property],
    })
    const csv = packToCsv(pack)
    expect(csv).toContain("NOT an HMRC submission")
    expect(csv).toContain("hmrcSubmission,false")
    expect(csv).toContain("working_papers")
  })
})
