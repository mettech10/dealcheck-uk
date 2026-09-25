/**
 * GET /api/v1/screener/token
 *
 * Read the signed-in user's Supabase tokens from the HttpOnly cookie
 * session so /screener/connect can hand them to the Deal Screener
 * extension. Cookie session only — do not accept Bearer (that would
 * re-issue a refresh token from an access token).
 *
 * This route MUST NOT write auth cookies. getUser()/getSession() on
 * the writable server client was clobbering chunked sb-*-auth-token
 * cookies (empty chunks persisted with a 7-day maxAge) and signing
 * the user out of the whole site.
 *
 * Does not create deals. Flask POST /v1/deals remains SoT.
 */

import { cookies } from "next/headers"
import { createReadOnlyClient } from "@/lib/supabase/server"
import { sessionFromSbCookies } from "@/lib/supabase/sessionCookies"
import { screenerJson, screenerOptions } from "@/lib/deal-screener/cors"
import type { ScreenerConnectTokens } from "@/lib/deal-screener/connectRedirect"

export const dynamic = "force-dynamic"

export async function OPTIONS(req: Request) {
  return screenerOptions(req)
}

export async function GET(req: Request) {
  const supabase = await createReadOnlyClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return screenerJson(req, { error: "unauthenticated" }, 401)
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  let tokens: ScreenerConnectTokens | null = session?.access_token
    ? {
        access_token: session.access_token,
        token_type: "bearer",
        expires_in: session.expires_in ?? 3600,
        expires_at: session.expires_at ?? null,
        refresh_token: session.refresh_token ?? "",
      }
    : null

  if (!tokens) {
    const cookieStore = await cookies()
    const parsed = sessionFromSbCookies(cookieStore.getAll())
    if (parsed) {
      tokens = {
        access_token: parsed.access_token,
        token_type: "bearer",
        expires_in: parsed.expires_in ?? 3600,
        expires_at: parsed.expires_at ?? null,
        refresh_token: parsed.refresh_token ?? "",
      }
    }
  }

  if (!tokens) {
    // Signed in but JWT not reconstructable — do NOT 401 (that used
    // to bounce the connect page to /login). Cookies were not cleared.
    return screenerJson(
      req,
      { error: "session_token_missing", email: user.email ?? null },
      503,
    )
  }

  return screenerJson(req, {
    ...tokens,
    email: user.email ?? null,
  })
}
