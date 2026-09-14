import { resolveFlaskBackendOrigin } from "../../../lib/deal-screener/backendOrigin"

declare const __SCREENER_FLASK_ORIGIN__: string | undefined

export const DEFAULT_APP_ORIGIN = "https://www.metalyzi.co.uk"
/** Canonical deals API — Flask BE. Next must not own create / screener_deals. */
export const DEFAULT_BACKEND_ORIGIN =
  typeof __SCREENER_FLASK_ORIGIN__ === "string" &&
  __SCREENER_FLASK_ORIGIN__.startsWith("http")
    ? __SCREENER_FLASK_ORIGIN__.replace(/\/$/, "")
    : resolveFlaskBackendOrigin()

export const STORAGE_KEYS = {
  accessToken: "screener.accessToken",
  refreshToken: "screener.refreshToken",
  expiresAt: "screener.expiresAt",
  email: "screener.email",
  appOrigin: "screener.appOrigin",
  backendOrigin: "screener.backendOrigin",
  rules: "screener.rules",
} as const

export type ScreenerSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  email: string | null
}

export async function getAppOrigin(): Promise<string> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.appOrigin)
  const origin = stored[STORAGE_KEYS.appOrigin]
  if (typeof origin === "string" && origin.startsWith("http")) {
    return origin.replace(/\/$/, "")
  }
  return DEFAULT_APP_ORIGIN
}

export async function saveAppOrigin(origin: string): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.appOrigin]: origin.replace(/\/$/, ""),
  })
}

export async function getBackendOrigin(): Promise<string> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.backendOrigin)
  const origin = stored[STORAGE_KEYS.backendOrigin]
  if (typeof origin === "string" && origin.startsWith("http")) {
    return origin.replace(/\/$/, "")
  }
  return DEFAULT_BACKEND_ORIGIN
}

export async function saveBackendOrigin(origin: string): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.backendOrigin]: origin.replace(/\/$/, ""),
  })
}

export async function getSession(): Promise<ScreenerSession | null> {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.expiresAt,
    STORAGE_KEYS.email,
  ])
  const accessToken = stored[STORAGE_KEYS.accessToken]
  if (typeof accessToken !== "string" || !accessToken) return null
  return {
    accessToken,
    refreshToken:
      typeof stored[STORAGE_KEYS.refreshToken] === "string"
        ? stored[STORAGE_KEYS.refreshToken]
        : "",
    expiresAt:
      typeof stored[STORAGE_KEYS.expiresAt] === "number"
        ? stored[STORAGE_KEYS.expiresAt]
        : 0,
    email:
      typeof stored[STORAGE_KEYS.email] === "string"
        ? stored[STORAGE_KEYS.email]
        : null,
  }
}

export async function saveSession(session: ScreenerSession): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.accessToken]: session.accessToken,
    [STORAGE_KEYS.refreshToken]: session.refreshToken,
    [STORAGE_KEYS.expiresAt]: session.expiresAt,
    [STORAGE_KEYS.email]: session.email,
  })
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.expiresAt,
    STORAGE_KEYS.email,
  ])
}

function parseHashTokens(url: string): {
  accessToken: string
  refreshToken: string
  expiresAt: number
} | null {
  const hash = url.split("#")[1]
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const accessToken = params.get("access_token")
  if (!accessToken) return null
  const expiresAtRaw = params.get("expires_at")
  const expiresIn = Number(params.get("expires_in") || "3600")
  const expiresAt = expiresAtRaw
    ? Number(expiresAtRaw) * (Number(expiresAtRaw) > 1e12 ? 1 : 1000)
    : Date.now() + expiresIn * 1000
  return {
    accessToken,
    refreshToken: params.get("refresh_token") || "",
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 3600_000,
  }
}

export async function connectAccount(): Promise<ScreenerSession> {
  const origin = await getAppOrigin()
  const redirectUrl = chrome.identity.getRedirectURL("callback")
  const url =
    `${origin}/screener/connect?redirect_uri=${encodeURIComponent(redirectUrl)}`
  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url,
    interactive: true,
  })
  if (!responseUrl) throw new Error("Connect was cancelled")
  const tokens = parseHashTokens(responseUrl)
  if (!tokens) throw new Error("Connect did not return a session")

  const me = await fetch(`${origin}/api/v1/screener/session`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  })
  const body = (await me.json().catch(() => ({}))) as {
    email?: string
    error?: string
  }
  if (!me.ok) {
    throw new Error(body.error || `Session check failed (${me.status})`)
  }

  const session: ScreenerSession = {
    ...tokens,
    email: body.email ?? null,
  }
  await saveSession(session)
  return session
}
