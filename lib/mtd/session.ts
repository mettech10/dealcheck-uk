/**
 * Server-side MTD auth: verify the user, then recover a Supabase JWT
 * so the BFF can call Flask `/v1/mtd/*` with Bearer.
 *
 * Live QA P0: `/api/mtd/token` returned 401 when `getUser()` succeeded
 * but `getSession()` had no access_token. That looked like "signed out"
 * on /mtd even though /analyse was authenticated. Only a missing user
 * is anonymous; a signed-in user without a JWT is a token error.
 */

export type CookiePair = { name: string; value: string }

const AUTH_TOKEN_COOKIE = /^(sb-.*-auth-token)(?:\.\d+)?$/

function looksLikeJwt(value: string): boolean {
  const parts = value.split(".")
  return parts.length === 3 && parts[0].startsWith("eyJ")
}

function decodeBase64Json(raw: string): unknown {
  const stripped = raw.startsWith("base64-") ? raw.slice("base64-".length) : raw
  const json = Buffer.from(stripped, "base64").toString("utf8")
  return JSON.parse(json)
}

function tokenFromParsed(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null
  const row = parsed as Record<string, unknown>
  const nested =
    row.currentSession && typeof row.currentSession === "object"
      ? (row.currentSession as Record<string, unknown>)
      : row
  const token = nested.access_token || nested.accessToken
  return typeof token === "string" && token.length > 0 ? token : null
}

/** Reconstruct a Supabase access token from sb-*-auth-token cookies (incl. chunks). */
export function accessTokenFromSbCookies(cookies: CookiePair[]): string | null {
  const chunks = cookies
    .filter((c) => AUTH_TOKEN_COOKIE.test(c.name) && !c.name.includes("code-verifier"))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  if (!chunks.length) return null

  const combined = chunks.map((c) => c.value).join("")
  if (!combined) return null
  if (looksLikeJwt(combined)) return combined

  if (combined.startsWith("base64-") || combined.startsWith("eyJ")) {
    try {
      const fromB64 = tokenFromParsed(decodeBase64Json(combined))
      if (fromB64) return fromB64
    } catch {
      /* fall through to JSON */
    }
  }

  try {
    return tokenFromParsed(JSON.parse(combined))
  } catch {
    return null
  }
}

export type MtdAuth =
  | { status: "anon" }
  | { status: "signed_in"; userId: string; email: string | null; accessToken: string }
  | { status: "token_missing"; userId: string; email: string | null }

export async function getMtdAuth(): Promise<MtdAuth> {
  const { createClient } = await import("@/lib/supabase/server")
  const { cookies } = await import("next/headers")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: "anon" }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  let accessToken = session?.access_token || null

  if (!accessToken) {
    const cookieStore = await cookies()
    accessToken = accessTokenFromSbCookies(cookieStore.getAll())
  }

  if (!accessToken) {
    const { data } = await supabase.auth.refreshSession()
    accessToken = data.session?.access_token || null
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

export const MTD_TOKEN_MISSING_MESSAGE =
  "You are signed in, but the session access token was not available to call the Flask MTD API. Sign out and back in, then retry. Next.js does not store mtd_* tables."
