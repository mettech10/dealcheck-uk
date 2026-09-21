/**
 * Deal Screener /screener/connect helpers.
 *
 * Session cookies are HttpOnly (lib/supabase/server.ts). The browser
 * SDK cannot see them, so this page must NOT call getSession() in the
 * client — identity is gated server-side; tokens are minted by
 * GET /api/v1/screener/token from the cookie session.
 */

export type ScreenerConnectTokens = {
  access_token: string
  token_type?: string
  expires_in?: number | null
  expires_at?: number | null
  refresh_token?: string | null
}

/** Chrome MV3 `chromiumapp.org` redirect for chrome.identity.launchWebAuthFlow. */
export function isSafeExtensionRedirect(uri: string): boolean {
  try {
    const u = new URL(uri)
    if (u.protocol !== "https:") return false
    const labels = u.hostname.split(".")
    const id = labels[0] ?? ""
    return (
      labels.length === 3 &&
      labels[1] === "chromiumapp" &&
      labels[2] === "org" &&
      /^[a-p]{32}$/.test(id)
    )
  } catch {
    return false
  }
}

export function screenerConnectPath(redirectUri?: string | null): string {
  if (!redirectUri) return "/screener/connect"
  return `/screener/connect?redirect_uri=${encodeURIComponent(redirectUri)}`
}

export function screenerConnectLoginPath(redirectUri?: string | null): string {
  return `/login?returnTo=${encodeURIComponent(screenerConnectPath(redirectUri))}`
}

/** Hash fragment consumed by the extension (`parseHashTokens`). Never query string. */
export function buildExtensionConnectHash(tokens: ScreenerConnectTokens): string {
  return new URLSearchParams({
    access_token: tokens.access_token,
    token_type: tokens.token_type ?? "bearer",
    expires_in: String(tokens.expires_in ?? 3600),
    expires_at: String(tokens.expires_at ?? ""),
    refresh_token: tokens.refresh_token ?? "",
  }).toString()
}
