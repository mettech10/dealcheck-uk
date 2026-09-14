import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { MTD_DISCLAIMER } from "@/lib/mtd/disclaimer"
import { incomeExpenseFromTotals, snapshotCategoryRows } from "@/lib/mtd/snapshot"
import type { FlaskPackSnapshot } from "@/lib/mtd/types"

describe("Flask pack snapshot display (not a Next ledger SoT)", () => {
  test("disclaimer matches Flask copy", () => {
    expect(MTD_DISCLAIMER).toContain("does not submit")
    expect(MTD_DISCLAIMER).toContain("HMRC")
  })

  test("income/expense totals exclude residential finance from expenses", () => {
    const totals = {
      uk_rent_income: 125000,
      repairs_and_maintenance: 4500,
      residential_finance_costs: 32000,
      non_residential_finance_costs: 1000,
    }
    const { income, expenses, net } = incomeExpenseFromTotals(totals)
    expect(income).toBe(125000)
    expect(expenses).toBe(5500)
    expect(net).toBe(119500)
  })

  test("category rows keep residential finance labelled separately", () => {
    const snapshot: FlaskPackSnapshot = {
      schemaVersion: 1,
      packType: "mtd_quarter_pack",
      disclaimer: MTD_DISCLAIMER,
      hmrcSubmit: false,
      periodTotalsPence: {
        uk_rent_income: 100,
        residential_finance_costs: 50,
      },
    }
    const rows = snapshotCategoryRows(snapshot)
    expect(rows.find((r) => r.code === "residential_finance_costs")?.isResidentialFinance).toBe(
      true,
    )
    expect(rows.find((r) => r.code === "residential_finance_costs")?.sa105Box).toBe("44")
  })
})

describe("Next does not own the MTD ledger write path", () => {
  test("client writes go to flaskMtdUrl /v1/mtd", () => {
    const src = readFileSync("lib/mtd/client.ts", "utf8")
    expect(src).toContain("flaskMtdUrl")
    expect(src).toContain("/ledger")
    expect(src).toContain("requirePlatformPropertyId")
    expect(src).not.toContain("mtd_ledger_entries")
    expect(src).not.toContain("from \"@/lib/mtd/server\"")
  })

  test("share proxy is the only Next /v1/mtd route", () => {
    const src = readFileSync("app/v1/mtd/share/[token]/route.ts", "utf8")
    expect(src).toContain("flaskMtdUrl")
    expect(src).toContain("/share/")
    expect(src).not.toContain("mtd_ledger")
  })
})
