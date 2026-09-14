import { createClient as createSupabaseJsClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"

/**
 * Session gate for API routes that proxy paid services (PropertyData,
 * the Flask backend, Bright Data scraping, Claude analysis). These were
 * publicly callable, letting anonymous traffic drain third-party quota;
 * every legitimate caller lives inside the auth-gated /analyse flow.
 *
 * Returns the Supabase user, or null when there is no valid session —
 * callers respond 401 on null.
 */
export async function getSessionUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization")
  if (!header?.toLowerCase().startsWith("bearer ")) return null
  const token = header.slice(7).trim()
  return token || null
}

/**
 * Cookie session (web app) or `Authorization: Bearer` (Deal Screener
 * extension). Bearer uses the same Metalyzi Supabase access token issued
 * on /screener/connect — not a separate account.
 */
export async function getRequestUser(req: Request) {
  const token = bearerToken(req)
  if (token) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (url && anon) {
      const client = createSupabaseJsClient(url, anon, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data } = await client.auth.getUser(token)
      if (data.user) return data.user
    }
  }
  return getSessionUser()
}

/**
 * Access token for Flask Bearer passthrough. Prefers the Authorization
 * header; otherwise the HttpOnly cookie session (session exchange).
 */
export async function getAccessTokenFromRequest(req: Request): Promise<string | null> {
  const header = bearerToken(req)
  if (header) return header
  const supabase = await createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
