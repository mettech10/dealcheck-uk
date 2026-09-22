/**
 * Recover the Supabase access token for Flask /v1/compliance.
 *
 * @supabase/ssr getUser() can succeed from cookies while getSession()
 * returns no access_token (chunked / base64 cookies, Next Route Handler
 * vs Edge proxy refresh). Flask ignores X-User-Id outside tests, so a
 * missing Bearer is a hard 401 on dashboard + property obligations.
 */

export function bearerFromAuthorization(
  header: string | null | undefined,
): string | null {
  if (!header) return null
  if (!header.toLowerCase().startsWith("bearer ")) return null
  const token = header.slice(7).trim()
  return token || null
}

export function parseSupabaseAccessToken(raw: string): string | null {
  let text = raw.trim()
  if (!text) return null
  if (text.startsWith("base64-")) {
    try {
      text = Buffer.from(text.slice(7), "base64").toString("utf8")
    } catch {
      return null
    }
  }
  try {
    const parsed = JSON.parse(text) as unknown
    return tokenFromUnknown(parsed)
  } catch {
    return null
  }
}

function tokenFromUnknown(parsed: unknown): string | null {
  if (!parsed) return null
  if (typeof parsed === "string") {
    return parsed.startsWith("eyJ") ? parsed : parseSupabaseAccessToken(parsed)
  }
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const found = tokenFromUnknown(item)
      if (found) return found
    }
    return null
  }
  if (typeof parsed === "object") {
    const rec = parsed as Record<string, unknown>
    if (typeof rec.access_token === "string" && rec.access_token) {
      return rec.access_token
    }
    if (rec.session) return tokenFromUnknown(rec.session)
    if (rec.currentSession) return tokenFromUnknown(rec.currentSession)
  }
  return null
}

const AUTH_COOKIE =
  /^(?:sb|supabase)-[a-z0-9-]+-auth-token(?:\.(\d+))?$/i

export function accessTokenFromCookieList(
  cookies: Array<{ name: string; value: string }>,
): string | null {
  const grouped = new Map<string, { idx: number; value: string }[]>()
  for (const cookie of cookies) {
    const match = AUTH_COOKIE.exec(cookie.name)
    if (!match) continue
    const base = cookie.name.replace(/\.\d+$/, "")
    const idx = match[1] ? Number(match[1]) : 0
    const list = grouped.get(base) ?? []
    list.push({ idx, value: cookie.value })
    grouped.set(base, list)
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.idx - b.idx)
    const token = parseSupabaseAccessToken(list.map((part) => part.value).join(""))
    if (token) return token
  }
  return null
}

export function firstAccessToken(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const token = (candidate || "").trim()
    if (token) return token
  }
  return null
}
