import {
  ensureBusiness,
  listOwnedProperties,
  mapLedgerRow,
  migrationRequiredResponse,
  requireMtdUser,
  tableMissing,
} from "@/lib/mtd/server"
import { buildPack } from "@/lib/mtd/pack"
import { currentTaxYear, parseQuarterParam, parseTaxYear, quarterPeriod } from "@/lib/mtd/taxYear"
import { MTD_DISCLAIMER } from "@/lib/mtd/disclaimer"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const auth = await requireMtdUser()
  if (auth.error) return auth.error

  const url = new URL(req.url)
  const taxYear = url.searchParams.get("taxYear") || currentTaxYear().taxYear
  const quarter = parseQuarterParam(url.searchParams.get("quarter")) ?? "year"
  if (!parseTaxYear(taxYear) || !quarterPeriod(taxYear, quarter)) {
    return NextResponse.json({ error: "Invalid taxYear or quarter" }, { status: 400 })
  }

  try {
    await ensureBusiness(auth.supabase, auth.user.id)
    const properties = await listOwnedProperties(auth.supabase, auth.user.id)
    const { data, error } = await auth.supabase
      .from("mtd_ledger_entries")
      .select("*")
      .eq("user_id", auth.user.id)
      .limit(5000)

    if (error) {
      if (tableMissing(error)) return migrationRequiredResponse()
      throw error
    }

    const pack = buildPack({
      taxYear,
      quarter,
      entries: (data ?? []).map((row) => mapLedgerRow(row as Record<string, unknown>)),
      properties,
    })

    return NextResponse.json({ pack, disclaimer: MTD_DISCLAIMER, hmrcSubmission: false })
  } catch (e) {
    const err = e as { message?: string; code?: string }
    if (tableMissing(err)) return migrationRequiredResponse()
    console.error("[mtd] pack GET", e)
    return NextResponse.json({ error: "Failed to build quarterly pack" }, { status: 500 })
  }
}
