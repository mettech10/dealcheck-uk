import { createAdminClient } from "@/lib/supabase/admin"
import { buildPack, packFilename, packToCsv } from "@/lib/mtd/pack"
import { mapLedgerRow, tableMissing, migrationRequiredResponse } from "@/lib/mtd/server"
import { currentTaxYear, parseQuarterParam, parseTaxYear, quarterPeriod } from "@/lib/mtd/taxYear"
import { MTD_DISCLAIMER } from "@/lib/mtd/disclaimer"
import { NextResponse } from "next/server"
import type { MtdProperty } from "@/lib/mtd/types"

async function loadSharePack(token: string, taxYear: string, quarter: ReturnType<typeof parseQuarterParam>) {
  const admin = createAdminClient()
  const { data: link, error } = await admin
    .from("mtd_share_links")
    .select("*")
    .eq("token", token)
    .maybeSingle()

  if (error) {
    if (tableMissing(error)) return { errorResponse: migrationRequiredResponse() }
    throw error
  }
  if (!link || link.revoked_at) {
    return { errorResponse: NextResponse.json({ error: "This share link is not valid." }, { status: 404 }) }
  }
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return { errorResponse: NextResponse.json({ error: "This share link has expired." }, { status: 410 }) }
  }

  const q = quarter ?? "year"
  if (!parseTaxYear(taxYear) || !quarterPeriod(taxYear, q)) {
    return { errorResponse: NextResponse.json({ error: "Invalid taxYear or quarter" }, { status: 400 }) }
  }

  const [{ data: properties }, { data: entries, error: ledgerError }, { data: business }] =
    await Promise.all([
      admin
        .from("portfolio_properties")
        .select("id, nickname, address, postcode, strategy, status")
        .eq("user_id", link.user_id)
        .order("created_at", { ascending: false }),
      admin.from("mtd_ledger_entries").select("*").eq("user_id", link.user_id).limit(5000),
      admin
        .from("mtd_property_businesses")
        .select("name, accounting_basis")
        .eq("id", link.business_id)
        .maybeSingle(),
    ])

  if (ledgerError) {
    if (tableMissing(ledgerError)) return { errorResponse: migrationRequiredResponse() }
    throw ledgerError
  }

  const mappedProperties: MtdProperty[] = (properties ?? []).map((row) => ({
    propertyId: row.id as string,
    nickname: (row.nickname as string | null) ?? null,
    address: row.address as string,
    postcode: (row.postcode as string | null) ?? null,
    strategy: (row.strategy as string | null) ?? null,
    status: (row.status as string | null) ?? null,
  }))

  const pack = buildPack({
    taxYear,
    quarter: q,
    entries: (entries ?? []).map((row) => mapLedgerRow(row as Record<string, unknown>)),
    properties: mappedProperties,
  })

  await admin
    .from("mtd_share_links")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("id", link.id)

  return {
    pack,
    business: business ?? { name: "UK property business", accounting_basis: "cash" },
    label: link.label as string | null,
    expires_at: link.expires_at as string | null,
  }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params
  const url = new URL(req.url)
  const taxYear = url.searchParams.get("taxYear") || currentTaxYear().taxYear
  const quarter = parseQuarterParam(url.searchParams.get("quarter")) ?? "year"
  const format = url.searchParams.get("format")

  try {
    const result = await loadSharePack(token, taxYear, quarter)
    if ("errorResponse" in result && result.errorResponse) return result.errorResponse

    if (format === "csv" || format === "json") {
      const filename = packFilename(result.pack!, format)
      if (format === "json") {
        return new NextResponse(JSON.stringify(result.pack, null, 2), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "X-Metalyzi-HMRC-Submission": "false",
          },
        })
      }
      return new NextResponse(packToCsv(result.pack!), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-Metalyzi-HMRC-Submission": "false",
        },
      })
    }

    return NextResponse.json({
      pack: result.pack,
      business: result.business,
      label: result.label,
      expires_at: result.expires_at,
      disclaimer: MTD_DISCLAIMER,
      hmrcSubmission: false,
      readOnly: true,
    })
  } catch (e) {
    console.error("[mtd] share token GET", e)
    return NextResponse.json({ error: "Failed to load shared pack" }, { status: 500 })
  }
}
