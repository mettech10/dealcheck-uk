/**
 * Reconstruct a Supabase session from sb-*-auth-token cookies (incl. chunks).
 *
 * Used when getSession() is empty or must not run (it can write cookies).
 * Same chunk/base64 shapes as lib/mtd/session.ts.
 */

export type CookiePair = { name: string; value: string }

export type ParsedSbSession = {
  access_token: string
  refresh_token: string
  expires_at?: number
  expires_in?: number
}

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

function sessionFromParsed(parsed: unknown): ParsedSbSession | null {
  if (!parsed) return null
  if (typeof parsed === "string") {
    return looksLikeJwt(parsed)
      ? { access_token: parsed, refresh_token: "" }
      : sessionFromParsed(safeJson(parsed))
  }
  if (typeof parsed !== "object") return null
  const row = parsed as Record<string, unknown>
  const nested =
    row.currentSession && typeof row.currentSession === "object"
      ? (row.currentSession as Record<string, unknown>)
      : row.session && typeof row.session === "object"
        ? (row.session as Record<string, unknown>)
        : row
  const access =
    (typeof nested.access_token === "string" && nested.access_token) ||
    (typeof nested.accessToken === "string" && nested.accessToken) ||
    ""
  if (!access) return null
  const refresh =
    (typeof nested.refresh_token === "string" && nested.refresh_token) ||
    (typeof nested.refreshToken === "string" && nested.refreshToken) ||
    ""
  const expiresAtRaw = nested.expires_at ?? nested.expiresAt
  const expiresInRaw = nested.expires_in ?? nested.expiresIn
  return {
    access_token: access,
    refresh_token: refresh,
    expires_at: typeof expiresAtRaw === "number" ? expiresAtRaw : undefined,
    expires_in: typeof expiresInRaw === "number" ? expiresInRaw : undefined,
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function combinedAuthCookieValue(cookies: CookiePair[]): string | null {
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
  return combined || null
}

export function sessionFromSbCookies(cookies: CookiePair[]): ParsedSbSession | null {
  const combined = combinedAuthCookieValue(cookies)
  if (!combined) return null
  if (looksLikeJwt(combined)) {
    return { access_token: combined, refresh_token: "" }
  }
  if (combined.startsWith("base64-") || combined.startsWith("eyJ")) {
    try {
      const fromB64 = sessionFromParsed(decodeBase64Json(combined))
      if (fromB64) return fromB64
    } catch {
      /* fall through */
    }
  }
  return sessionFromParsed(safeJson(combined))
}
