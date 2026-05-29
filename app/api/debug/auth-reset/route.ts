import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { isAdminEmail } from "@/lib/admin"

/**
 * GET /api/debug/auth-reset
 *
 * Nukes every sb-* (Supabase) cookie on the current domain by issuing
 * Set-Cookie headers with Max-Age=0 + matching name/path. Used when
 * the browser is holding broken session cookies from a prior failed
 * sign-in attempt — those poison subsequent getUser() calls with
 * "Auth session missing!" because the cookie values don't
 * deserialise into a valid session.
 *
 * After hitting this endpoint:
 *   1. Verify with GET /api/debug/auth → sbCookieCount should be 0
 *   2. Hit /login → sign in fresh — new cookies will be clean
 *
 * No auth gate. Anyone can clear their own cookies; we're not
 * exposing anything that wasn't already theirs.
 */

export const dynamic = "force-dynamic"

export async function GET() {
  // Admin gate — non-admins get a 404 so the endpoint isn't a
  // drive-by sign-out tool for any visitor.
  let userEmail: string | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    userEmail = data.user?.email ?? null
  } catch {
    /* getUser errors are fine — we treat that as anon */
  }
  if (!isAdminEmail(userEmail)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const cookieStore = await cookies()
  const all = cookieStore.getAll()
  const sbCookies = all.filter((c) => c.name.startsWith("sb-"))

  // Build a response we can hang Set-Cookie headers off, then ALSO
  // delete via the request cookieStore so the current request sees
  // them gone — covers both same-request reads and the browser-side
  // persistence layer.
  const cleared = sbCookies.map((c) => c.name)
  const response = NextResponse.json({
    cleared,
    count: cleared.length,
    nextStep:
      cleared.length > 0
        ? "Visit /api/debug/auth to confirm sbCookieCount=0, then /login to sign in fresh."
        : "Nothing to clear — no sb-* cookies were present.",
  })

  for (const name of cleared) {
    // Delete on the response: Max-Age=0 + matching path. Domain is
    // omitted so the browser uses the request's host (same scope
    // Supabase originally set on).
    response.cookies.set({
      name,
      value: "",
      path: "/",
      maxAge: 0,
    })
    // Also delete from the current request store so the diagnostic
    // round-trip immediately reflects the change.
    try {
      cookieStore.delete(name)
    } catch {
      /* read-only in some contexts; harmless */
    }
  }

  return response
}
