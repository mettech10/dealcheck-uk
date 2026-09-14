import {
  listOwnedProperties,
  migrationRequiredResponse,
  requireMtdUser,
  tableMissing,
} from "@/lib/mtd/server"
import { NextResponse } from "next/server"

/**
 * Portfolio properties are the source of truth (`propertyId`).
 * MTD Pack does not create properties — add them in Portfolio Tracker.
 */
export async function GET() {
  const auth = await requireMtdUser()
  if (auth.error) return auth.error

  try {
    const properties = await listOwnedProperties(auth.supabase, auth.user.id)
    return NextResponse.json({
      properties,
      sourceOfTruth: "propertyId",
    })
  } catch (e) {
    const err = e as { message?: string; code?: string }
    if (tableMissing(err)) return migrationRequiredResponse()
    console.error("[mtd] properties GET", e)
    return NextResponse.json({ error: "Failed to load properties" }, { status: 500 })
  }
}
