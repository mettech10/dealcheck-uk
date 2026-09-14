import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Issue the signed-in user's Supabase JWT so the browser can call
 * Flask `/v1/mtd/*` with `Authorization: Bearer`. This route does not
 * write ledger data — Flask owns mtd_* tables.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const accessToken = session?.access_token
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({
    accessToken,
    tokenType: "Bearer",
    canonical: "flask",
  })
}
