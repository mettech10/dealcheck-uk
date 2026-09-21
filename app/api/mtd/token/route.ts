import { NextResponse } from "next/server"
import { getMtdAuth, MTD_TOKEN_MISSING_MESSAGE } from "@/lib/mtd/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
}

/**
 * Issue the signed-in user's Supabase JWT. The MTD UI no longer calls
 * Flask from the browser — `/api/mtd/[...path]` is the BFF. This route
 * stays for diagnostics and any same-origin caller that needs Bearer.
 *
 * 401 = anonymous. 503 = signed in but access_token missing (do NOT
 * treat that as the sign-in gate).
 */
export async function GET() {
  const auth = await getMtdAuth()
  if (auth.status === "anon") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE })
  }
  if (auth.status === "token_missing") {
    return NextResponse.json(
      { error: MTD_TOKEN_MISSING_MESSAGE, code: "mtd_session_token_missing" },
      { status: 503, headers: NO_STORE },
    )
  }
  return NextResponse.json(
    {
      accessToken: auth.accessToken,
      tokenType: "Bearer",
      canonical: "flask",
    },
    { headers: NO_STORE },
  )
}
