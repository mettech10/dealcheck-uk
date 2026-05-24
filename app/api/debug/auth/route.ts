import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/debug/auth — auth-state introspection (signed-in or not).
 *
 * Open this URL in the SAME browser tab where you tried to sign in.
 * Tells us in one response whether the auth chain is reaching this
 * server at all, and if so, where the break is:
 *
 *   - sbCookieCount > 0 + user → working, navbar bug elsewhere
 *   - sbCookieCount > 0 + no user → cookie present but invalid/expired
 *   - sbCookieCount === 0 + cookieHeaderLen > 0 → cookies arrive but
 *     not under sb-* names (Supabase cookie domain or name mismatch)
 *   - sbCookieCount === 0 + cookieHeaderLen === 0 → no cookies at all
 *     reach the server (cross-domain / blocked / never set)
 *
 * Never exposes cookie values, only names + counts. Safe to hit while
 * signed in or anonymous; no admin gate so the user doesn't have to
 * configure ADMIN_EMAILS just to debug login.
 */

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const cookieStore = await cookies()
  const all = cookieStore.getAll()
  const sbCookies = all.filter((c) => c.name.startsWith("sb-"))

  let userId: string | null = null
  let userEmail: string | null = null
  let authError: string | null = null
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    userId = data.user?.id ?? null
    userEmail = data.user?.email ?? null
    if (error) authError = error.message
  } catch (e) {
    authError = e instanceof Error ? e.message : "unknown"
  }

  const host = req.headers.get("host") ?? ""
  const rawCookie = req.headers.get("cookie") ?? ""

  return NextResponse.json({
    host,
    isWwwSubdomain: host.startsWith("www."),
    cookieHeaderLength: rawCookie.length,
    cookieCount: all.length,
    cookieNames: all.map((c) => c.name).sort(),
    sbCookieCount: sbCookies.length,
    sbCookieNames: sbCookies.map((c) => c.name),
    userId,
    userEmail,
    authError,
    // Useful indicator: if the page calling this thinks the user is
    // logged in but you see userId=null here, it's a stale render
    // problem; if both agree there's no user, it's a cookie problem.
    hint:
      sbCookies.length === 0
        ? rawCookie.length === 0
          ? "No cookies reach the server. Browser-side issue: same-site mismatch, blocked third-party cookies, or domain split."
          : "Cookies reach the server but no sb-* cookies. Check cookie domain in DevTools (sb-* on which host?)."
        : userId
          ? "Logged in. If the navbar still shows login/signup, it's a render-side cache."
          : "sb-* cookies present but session invalid (likely expired / corrupted).",
  })
}
