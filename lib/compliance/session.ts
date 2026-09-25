/**
 * Server-side Compliance auth, same recovery as MTD (`lib/mtd/session.ts`)
 * plus a getUser(jwt) check so we never forward a token our own Supabase
 * already rejects.
 *
 * Cookie reads use createReadOnlyClient so getUser()/getSession() cannot
 * persist empty maxAge:0 chunk deletions as 7-day cookies (#108).
 * refreshSession() uses the writable client, which keeps Supabase's
 * maxAge via mergeAuthCookieOptions.
 */

import {
  accessTokenFromCookieList,
  bearerFromAuthorization,
  firstUserAccessToken,
  isUserAccessToken,
} from "./accessToken"

export type ComplianceAuth =
  | { status: "anon" }
  | { status: "signed_in"; userId: string; email: string | null; accessToken: string }
  | { status: "token_missing"; userId: string; email: string | null }

export const COMPLIANCE_TOKEN_MISSING_MESSAGE =
  "You are signed in, but a valid Supabase access token was not available to call Flask /v1/compliance. Sign out and back in, then retry."

export async function getComplianceAuth(
  request?: Request,
): Promise<ComplianceAuth> {
  const { createClient, createReadOnlyClient } = await import(
    "@/lib/supabase/server"
  )
  const { cookies } = await import("next/headers")
  const { sessionFromSbCookies } = await import("@/lib/supabase/sessionCookies")

  const supabase = await createReadOnlyClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: "anon" }

  const incoming = request
    ? bearerFromAuthorization(request.headers.get("authorization"))
    : null
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const cookieStore = await cookies()
  const cookieSession = sessionFromSbCookies(cookieStore.getAll())

  let accessToken = firstUserAccessToken(
    session?.access_token,
    incoming,
    cookieSession?.access_token,
    accessTokenFromCookieList(cookieStore.getAll()),
  )

  if (accessToken) {
    const checked = await supabase.auth.getUser(accessToken)
    if (checked.error || !checked.data.user) accessToken = null
  }

  if (!accessToken) {
    const writable = await createClient()
    const { data } = await writable.auth.refreshSession()
    const refreshed = data.session?.access_token || null
    accessToken = isUserAccessToken(refreshed) ? refreshed : null
  }

  if (!accessToken) {
    return { status: "token_missing", userId: user.id, email: user.email ?? null }
  }
  return {
    status: "signed_in",
    userId: user.id,
    email: user.email ?? null,
    accessToken,
  }
}
