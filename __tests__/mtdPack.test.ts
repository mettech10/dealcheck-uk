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
  test("browser client writes go to the /api/mtd BFF, not Flask origin", () => {
    const src = readFileSync("lib/mtd/client.ts", "utf8")
    expect(src).toContain("mtdBffUrl")
    expect(src).toContain("/ledger")
    expect(src).toContain("requirePlatformPropertyId")
    expect(src).not.toContain("flaskMtdUrl")
    expect(src).not.toContain("mtd_ledger_entries")
    expect(src).not.toContain("from \"@/lib/mtd/server\"")
    expect(src).not.toContain('fetch("/api/mtd/token")')
  })

  test("share proxy is the only Next /v1/mtd route", () => {
    const src = readFileSync("app/v1/mtd/share/[token]/route.ts", "utf8")
    expect(src).toContain("flaskMtdUrl")
    expect(src).toContain("/share/")
    expect(src).not.toContain("mtd_ledger")
  })

  test("BFF forwards to Flask /v1/mtd and does not create mtd_* tables", () => {
    const src = readFileSync("app/api/mtd/[...path]/route.ts", "utf8")
    expect(src).toContain("flaskMtdUrl")
    expect(src).toContain("getMtdAuth")
    expect(src).not.toContain("mtd_ledger_entries")
    expect(src).toContain("hmrcSubmit: false")
  })

  test("auth gate probes /api/me so a missing JWT is not a sign-in wall", () => {
    const src = readFileSync("components/mtd/workspace-shell.tsx", "utf8")
    expect(src).toContain("/api/me")
    expect(src).toContain("ensureBusiness")
    expect(src).not.toContain("getFlaskBearer")
  })

  test("Tools nav canonical href is /mtd and /tools/mtd redirects", () => {
    const nav = readFileSync("components/landing/navbar.tsx", "utf8")
    expect(nav).toMatch(/href:\s*"\/mtd"/)
    expect(nav).not.toMatch(/href:\s*"\/tools\/mtd"/)
    const cfg = readFileSync("next.config.mjs", "utf8")
    expect(cfg).toContain("source: '/tools/mtd'")
    expect(cfg).toContain("destination: '/mtd'")
  })

  test("token route is uncached and does not 401 a signed-in user without JWT", () => {
    const src = readFileSync("app/api/mtd/token/route.ts", "utf8")
    expect(src).toContain('dynamic = "force-dynamic"')
    expect(src).toContain("no-store")
    expect(src).toContain("token_missing")
    expect(src).toContain("503")
  })
})
