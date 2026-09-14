import {
  ensureBusiness,
  migrationRequiredResponse,
  requireMtdUser,
  tableMissing,
} from "@/lib/mtd/server"
import { MTD_DISCLAIMER } from "@/lib/mtd/disclaimer"
import { NextResponse } from "next/server"

export async function GET() {
  const auth = await requireMtdUser()
  if (auth.error) return auth.error

  try {
    const business = await ensureBusiness(auth.supabase, auth.user.id)
    return NextResponse.json({
      business,
      disclaimer: MTD_DISCLAIMER,
      hmrcSubmission: false,
    })
  } catch (e) {
    const err = e as { message?: string; code?: string }
    if (tableMissing(err)) return migrationRequiredResponse()
    console.error("[mtd] business GET", e)
    return NextResponse.json({ error: "Failed to load property business" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const auth = await requireMtdUser()
  if (auth.error) return auth.error

  let body: { name?: string; accounting_basis?: string; notes?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const business = await ensureBusiness(auth.supabase, auth.user.id)
    const updates: Record<string, unknown> = {}
    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim().slice(0, 200)
    }
    if (body.accounting_basis === "cash" || body.accounting_basis === "accruals") {
      updates.accounting_basis = body.accounting_basis
    }
    if ("notes" in body) {
      updates.notes = body.notes == null || body.notes === "" ? null : String(body.notes).slice(0, 2000)
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ business, disclaimer: MTD_DISCLAIMER, hmrcSubmission: false })
    }

    const { data, error } = await auth.supabase
      .from("mtd_property_businesses")
      .update(updates)
      .eq("id", business.id)
      .eq("user_id", auth.user.id)
      .select("*")
      .single()

    if (error) {
      if (tableMissing(error)) return migrationRequiredResponse()
      throw error
    }
    return NextResponse.json({ business: data, disclaimer: MTD_DISCLAIMER, hmrcSubmission: false })
  } catch (e) {
    const err = e as { message?: string; code?: string }
    if (tableMissing(err)) return migrationRequiredResponse()
    console.error("[mtd] business PATCH", e)
    return NextResponse.json({ error: "Failed to update property business" }, { status: 500 })
  }
}
