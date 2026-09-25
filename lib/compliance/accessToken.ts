/**
 * Recover a *user access* JWT for Flask /v1/compliance.
 *
 * Live QA r3: Flask returned "Invalid or expired token" after we started
 * forwarding *a* Bearer. Two ways that happens:
 *   1. We forwarded a refresh token, truncated cookie, or expired
 *      getSession() token (getUser() can succeed via refresh while
 *      getSession() still has the old access_token).
 *   2. Flask /auth/v1/user rejected a valid user JWT because its apikey
 *      was the anon key, missing, or the user token itself. MTD live QA
 *      hit the same pattern (`/api/mtd/token` 200, `/api/mtd/businesses`
 *      401 Unauthorised). /v1/deals uses the service role as apikey.
 *      That is a BE fix (503 if unconfigured; never user token as apikey).
 *
 * Only `role=authenticated` access tokens are forwarded. Cookie parsing
 * matches lib/mtd/session.ts (chunked sb-*-auth-token, base64- prefix).
 */

export type CookiePair = { name: string; value: string }

export function bearerFromAuthorization(
  header: string | null | undefined,
): string | null {
  if (!header) return null
  if (!header.toLowerCase().startsWith("bearer ")) return null
  const token = header.slice(7).trim()
  return token || null
}

export function looksLikeJwt(value: string): boolean {
  const parts = value.split(".")
  return parts.length === 3 && parts[0].startsWith("eyJ")
}

export function decodeJwtPayload(
  token: string,
): Record<string, unknown> | null {
  if (!looksLikeJwt(token)) return null
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4)
    const json = Buffer.from(padded, "base64").toString("utf8")
    const parsed = JSON.parse(json) as unknown
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** True only for a Supabase *user access* JWT, not a refresh token or anon key. */
export function isUserAccessToken(token: string | null | undefined): boolean {
  const value = (token || "").trim()
  if (!looksLikeJwt(value)) return false
  const payload = decodeJwtPayload(value)
  if (!payload) return false
  const role = String(payload.role || "")
  if (role !== "authenticated" && role !== "service_role") return false
  const sub = payload.sub || payload.user_id
  if (typeof sub !== "string" || !sub) return false
  const exp = Number(payload.exp)
  if (Number.isFinite(exp) && exp * 1000 <= Date.now() - 5_000) return false
  return true
}

/** True when the JWT is missing, expired, or within `skewMs` of expiry. */
export function accessTokenNeedsRefresh(
  token: string | null | undefined,
  skewMs = 120_000,
): boolean {
  if (!isUserAccessToken(token)) return true
  const payload = decodeJwtPayload(token!)
  const exp = Number(payload?.exp)
  if (!Number.isFinite(exp)) return false
  return exp * 1000 <= Date.now() + skewMs
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

function decodeBase64Json(raw: string): unknown {
  const stripped = raw.startsWith("base64-") ? raw.slice("base64-".length) : raw
  const json = Buffer.from(stripped, "base64").toString("utf8")
  return JSON.parse(json)
}

export function parseSupabaseAccessToken(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  if (looksLikeJwt(text) && isUserAccessToken(text)) return text

  if (text.startsWith("base64-") || text.startsWith("eyJ")) {
    try {
      const fromB64 = tokenFromParsed(decodeBase64Json(text))
      if (fromB64 && isUserAccessToken(fromB64)) return fromB64
    } catch {
      /* fall through */
    }
  }

  try {
    const fromJson = tokenFromParsed(JSON.parse(text))
    if (fromJson && isUserAccessToken(fromJson)) return fromJson
  } catch {
    return null
  }
  return null
}

const AUTH_TOKEN_COOKIE = /^(sb-.*-auth-token)(?:\.\d+)?$/

export function accessTokenFromCookieList(cookies: CookiePair[]): string | null {
  const chunks = cookies
    .filter(
      (c) =>
        AUTH_TOKEN_COOKIE.test(c.name) &&
        !c.name.includes("code-verifier") &&
        c.value,
    )
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  if (!chunks.length) return null

  const combined = chunks.map((c) => c.value).join("")
  if (!combined) return null
  return parseSupabaseAccessToken(combined)
}

export function firstUserAccessToken(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const token = (candidate || "").trim()
    if (isUserAccessToken(token)) return token
  }
  return null
}

/** @deprecated use firstUserAccessToken — kept so older tests compile if imported */
export const firstAccessToken = firstUserAccessToken
