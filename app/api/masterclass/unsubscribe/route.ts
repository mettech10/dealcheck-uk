/**
 * One-click unsubscribe (Section 5) — GET /api/masterclass/unsubscribe
 *
 * Linked from the footer of every masterclass marketing email. The link is
 * self-authenticating (email + HMAC token minted at send time), so it works
 * from any mail client with no session — but nobody can unsubscribe someone
 * else without the token. On success (or repeat click) redirects to the
 * friendly confirmation page.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { verifyUnsubscribeToken } from "@/lib/masterclass-email"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const email = (searchParams.get("email") ?? "").toLowerCase().trim()
  const token = searchParams.get("token") ?? ""

  if (!email || !token || !verifyUnsubscribeToken(email, token)) {
    return NextResponse.json({ error: "Invalid unsubscribe link" }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from("masterclass_leads")
      .update({ unsubscribed: true })
      .eq("email", email)
    if (error) {
      console.error("[masterclass/unsubscribe] update error:", error)
      return NextResponse.json(
        { error: "Something went wrong — please try again" },
        { status: 500 },
      )
    }
  } catch (err) {
    console.error("[masterclass/unsubscribe] error:", err)
    return NextResponse.json(
      { error: "Something went wrong — please try again" },
      { status: 500 },
    )
  }

  return NextResponse.redirect(`${origin}/masterclass/unsubscribed`)
}
