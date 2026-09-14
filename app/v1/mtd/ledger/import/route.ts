import {
  ensureBusiness,
  listOwnedProperties,
  mapLedgerRow,
  migrationRequiredResponse,
  requireMtdUser,
  tableMissing,
} from "@/lib/mtd/server"
import { parseLedgerCsv } from "@/lib/mtd/csv"
import { isCategoryId } from "@/lib/mtd/categories"
import { parseIsoDate } from "@/lib/mtd/taxYear"
import { isUuid } from "@/lib/mtd/validate"
import { NextResponse } from "next/server"

interface ImportRow {
  propertyId?: string
  entryDate?: string
  amount?: number
  categoryId?: string
  description?: string
  reference?: string | null
}

export async function POST(req: Request) {
  const auth = await requireMtdUser()
  if (auth.error) return auth.error

  const contentType = req.headers.get("content-type") || ""
  let rows: ImportRow[] = []
  let defaultPropertyId: string | null = null

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData()
      const file = form.get("file")
      defaultPropertyId = typeof form.get("propertyId") === "string" ? String(form.get("propertyId")) : null
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file is required" }, { status: 400 })
      }
      const text = await file.text()
      const parsed = parseLedgerCsv(text)
      rows = parsed.map((r) => ({
        propertyId: r.propertyId || defaultPropertyId || undefined,
        entryDate: r.entryDate,
        amount: r.amount,
        categoryId: r.categoryId || undefined,
        description: r.description,
        reference: r.reference,
      }))
    } else {
      const body = await req.json()
      defaultPropertyId = typeof body.propertyId === "string" ? body.propertyId : null
      if (!Array.isArray(body.rows)) {
        return NextResponse.json({ error: "rows[] is required" }, { status: 400 })
      }
      rows = body.rows as ImportRow[]
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to parse import"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 })
  }
  if (rows.length > 1000) {
    return NextResponse.json({ error: "Import is limited to 1,000 rows." }, { status: 400 })
  }

  try {
    const business = await ensureBusiness(auth.supabase, auth.user.id)
    const ownedIds = new Set(
      (await listOwnedProperties(auth.supabase, auth.user.id)).map((p) => p.propertyId),
    )
    const errors: { index: number; error: string }[] = []
    const inserts: Record<string, unknown>[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const propertyId = (row.propertyId || defaultPropertyId || "").trim()
      if (!isUuid(propertyId)) {
        errors.push({ index: i, error: "propertyId is required" })
        continue
      }
      if (!parseIsoDate(row.entryDate || "")) {
        errors.push({ index: i, error: "entryDate must be YYYY-MM-DD" })
        continue
      }
      const amount = Number(row.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        errors.push({ index: i, error: "amount must be greater than 0" })
        continue
      }
      const categoryId = (row.categoryId || "").trim()
      if (!isCategoryId(categoryId)) {
        errors.push({ index: i, error: "categoryId is not an SA105 category" })
        continue
      }
      const description = (row.description || "").trim()
      if (!description) {
        errors.push({ index: i, error: "description is required" })
        continue
      }
      if (!ownedIds.has(propertyId)) {
        errors.push({ index: i, error: "propertyId is not in your portfolio" })
        continue
      }
      inserts.push({
        user_id: auth.user.id,
        business_id: business.id,
        property_id: propertyId,
        entry_date: row.entryDate,
        amount: Math.round(amount * 100) / 100,
        category_id: categoryId,
        description: description.slice(0, 500),
        reference: row.reference ? String(row.reference).slice(0, 120) : null,
        source: "csv",
      })
    }

    if (inserts.length === 0) {
      return NextResponse.json({ imported: 0, errors }, { status: 400 })
    }

    const { data, error } = await auth.supabase
      .from("mtd_ledger_entries")
      .insert(inserts)
      .select("*")

    if (error) {
      if (tableMissing(error)) return migrationRequiredResponse()
      throw error
    }

    return NextResponse.json({
      imported: data?.length ?? 0,
      entries: (data ?? []).map((row) => mapLedgerRow(row as Record<string, unknown>)),
      errors,
    })
  } catch (e) {
    const err = e as { message?: string; code?: string }
    if (tableMissing(err)) return migrationRequiredResponse()
    console.error("[mtd] ledger import", e)
    return NextResponse.json({ error: "Failed to import ledger" }, { status: 500 })
  }
}
