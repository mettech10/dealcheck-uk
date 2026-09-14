import {
  assertOwnedProperty,
  ensureBusiness,
  listOwnedProperties,
  mapLedgerRow,
  migrationRequiredResponse,
  requireMtdUser,
  tableMissing,
} from "@/lib/mtd/server"
import { validateLedgerInput } from "@/lib/mtd/validate"
import { parseQuarterParam, quarterPeriod, toIsoDate } from "@/lib/mtd/taxYear"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const auth = await requireMtdUser()
  if (auth.error) return auth.error

  const url = new URL(req.url)
  const propertyId = url.searchParams.get("propertyId")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const taxYear = url.searchParams.get("taxYear")
  const quarter = parseQuarterParam(url.searchParams.get("quarter"))

  try {
    let query = auth.supabase
      .from("mtd_ledger_entries")
      .select("*")
      .eq("user_id", auth.user.id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000)

    if (propertyId) query = query.eq("property_id", propertyId)

    let fromDate = from
    let toDate = to
    if (taxYear) {
      const period = quarterPeriod(taxYear, quarter ?? "year")
      if (!period) return NextResponse.json({ error: "Invalid taxYear or quarter" }, { status: 400 })
      fromDate = toIsoDate(period.start)
      toDate = toIsoDate(period.end)
    }
    if (fromDate) query = query.gte("entry_date", fromDate)
    if (toDate) query = query.lte("entry_date", toDate)

    const { data, error } = await query
    if (error) {
      if (tableMissing(error)) return migrationRequiredResponse()
      throw error
    }

    const properties = await listOwnedProperties(auth.supabase, auth.user.id)
    return NextResponse.json({
      entries: (data ?? []).map((row) => mapLedgerRow(row as Record<string, unknown>)),
      properties,
    })
  } catch (e) {
    const err = e as { message?: string; code?: string }
    if (tableMissing(err)) return migrationRequiredResponse()
    console.error("[mtd] ledger GET", e)
    return NextResponse.json({ error: "Failed to load ledger" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireMtdUser()
  if (auth.error) return auth.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = validateLedgerInput((body ?? {}) as Record<string, unknown>)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const owned = await assertOwnedProperty(auth.supabase, auth.user.id, parsed.value.propertyId)
    if (!owned) {
      return NextResponse.json(
        { error: "propertyId was not found in your portfolio.", code: "unknown_property" },
        { status: 400 },
      )
    }

    const business = await ensureBusiness(auth.supabase, auth.user.id)
    const { data, error } = await auth.supabase
      .from("mtd_ledger_entries")
      .insert({
        user_id: auth.user.id,
        business_id: business.id,
        property_id: parsed.value.propertyId,
        entry_date: parsed.value.entryDate,
        amount: parsed.value.amount,
        category_id: parsed.value.categoryId,
        description: parsed.value.description,
        reference: parsed.value.reference,
        source: parsed.value.source,
      })
      .select("*")
      .single()

    if (error) {
      if (tableMissing(error)) return migrationRequiredResponse()
      throw error
    }
    return NextResponse.json({ entry: mapLedgerRow(data as Record<string, unknown>) }, { status: 201 })
  } catch (e) {
    const err = e as { message?: string; code?: string }
    if (tableMissing(err)) return migrationRequiredResponse()
    console.error("[mtd] ledger POST", e)
    return NextResponse.json({ error: "Failed to save ledger entry" }, { status: 500 })
  }
}
