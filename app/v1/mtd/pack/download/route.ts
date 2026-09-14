import {
  ensureBusiness,
  listOwnedProperties,
  mapLedgerRow,
  migrationRequiredResponse,
  requireMtdUser,
  tableMissing,
} from "@/lib/mtd/server"
import { buildPack, packFilename, packToCsv } from "@/lib/mtd/pack"
import { currentTaxYear, parseQuarterParam, parseTaxYear, quarterPeriod } from "@/lib/mtd/taxYear"
import { NextResponse } from "next/server"

/**
 * Download placeholder for the quarterly pack.
 * Returns working papers (CSV or JSON). This is not an HMRC submission payload.
 */
export async function GET(req: Request) {
  const auth = await requireMtdUser()
  if (auth.error) return auth.error

  const url = new URL(req.url)
  const taxYear = url.searchParams.get("taxYear") || currentTaxYear().taxYear
  const quarter = parseQuarterParam(url.searchParams.get("quarter")) ?? "year"
  const format = url.searchParams.get("format") === "json" ? "json" : "csv"

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

    const filename = packFilename(pack, format)
    if (format === "json") {
      return new NextResponse(JSON.stringify(pack, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-Metalyzi-HMRC-Submission": "false",
          "X-Metalyzi-Download-Kind": "working_papers",
        },
      })
    }

    return new NextResponse(packToCsv(pack), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Metalyzi-HMRC-Submission": "false",
        "X-Metalyzi-Download-Kind": "working_papers",
      },
    })
  } catch (e) {
    const err = e as { message?: string; code?: string }
    if (tableMissing(err)) return migrationRequiredResponse()
    console.error("[mtd] pack download", e)
    return NextResponse.json({ error: "Failed to download pack" }, { status: 500 })
  }
}
