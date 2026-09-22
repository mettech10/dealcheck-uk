/**
 * GET /api/v1/screener/token
 *
 * Mint the signed-in user's Supabase tokens from the HttpOnly cookie
 * session so /screener/connect can hand them to the Deal Screener
 * extension. The browser SDK cannot read those cookies (see
 * app/tools/portfolio/page.tsx). Cookie session only — do not accept
 * Bearer here (that would re-issue a refresh token from an access token).
 *
 * Does not create deals. Flask POST /v1/deals remains SoT.
 */

import { createClient } from "@/lib/supabase/server"
import { screenerJson, screenerOptions } from "@/lib/deal-screener/cors"

export const dynamic = "force-dynamic"

export async function OPTIONS(req: Request) {
  return screenerOptions(req)
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return screenerJson(req, { error: "unauthenticated" }, 401)
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return screenerJson(req, { error: "unauthenticated" }, 401)
  }

  return screenerJson(req, {
    access_token: session.access_token,
    token_type: "bearer",
    expires_in: session.expires_in ?? 3600,
    expires_at: session.expires_at ?? null,
    refresh_token: session.refresh_token ?? "",
    email: user.email ?? null,
  })
}
