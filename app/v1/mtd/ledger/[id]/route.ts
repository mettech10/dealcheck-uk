import {
  assertOwnedProperty,
  mapLedgerRow,
  migrationRequiredResponse,
  requireMtdUser,
  tableMissing,
} from "@/lib/mtd/server"
import { validateLedgerInput } from "@/lib/mtd/validate"
import { NextResponse } from "next/server"

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireMtdUser()
  if (auth.error) return auth.error
  const { id } = await ctx.params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { data: existing, error: readError } = await auth.supabase
    .from("mtd_ledger_entries")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle()

  if (readError) {
    if (tableMissing(readError)) return migrationRequiredResponse()
    return NextResponse.json({ error: "Failed to load entry" }, { status: 500 })
  }
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = validateLedgerInput({
    propertyId: body.propertyId ?? existing.property_id,
    entryDate: body.entryDate ?? String(existing.entry_date).slice(0, 10),
    amount: body.amount ?? existing.amount,
    categoryId: body.categoryId ?? existing.category_id,
    description: body.description ?? existing.description,
    reference: body.reference === undefined ? existing.reference : body.reference,
    source: existing.source,
  })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const owned = await assertOwnedProperty(auth.supabase, auth.user.id, parsed.value.propertyId)
  if (!owned) {
    return NextResponse.json(
      { error: "propertyId was not found in your portfolio.", code: "unknown_property" },
      { status: 400 },
    )
  }

  const { data, error } = await auth.supabase
    .from("mtd_ledger_entries")
    .update({
      property_id: parsed.value.propertyId,
      entry_date: parsed.value.entryDate,
      amount: parsed.value.amount,
      category_id: parsed.value.categoryId,
      description: parsed.value.description,
      reference: parsed.value.reference,
    })
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("*")
    .single()

  if (error) {
    if (tableMissing(error)) return migrationRequiredResponse()
    console.error("[mtd] ledger PATCH", error)
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 })
  }
  return NextResponse.json({ entry: mapLedgerRow(data as Record<string, unknown>) })
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireMtdUser()
  if (auth.error) return auth.error
  const { id } = await ctx.params

  const { data, error } = await auth.supabase
    .from("mtd_ledger_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("id")

  if (error) {
    if (tableMissing(error)) return migrationRequiredResponse()
    console.error("[mtd] ledger DELETE", error)
    return NextResponse.json({ error: "Failed to delete entry" }, { status: 500 })
  }
  if (!data?.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
