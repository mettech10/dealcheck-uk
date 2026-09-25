/**
 * Auth landing helpers — returnTo whitelist + /signup query preservation.
 *
 * Marketing links hit /signup (and aliases /register, /sign-up). Those
 * must stay on-origin and must not bounce a signed-in user into a loop
 * back through the auth gate.
 */

export const SIGNUP_PATH = "/signup"
export const SIGNUP_ALIASES = ["/register", "/sign-up"] as const

export const AUTH_GATE_PATHS = new Set<string>([
  "/login",
  SIGNUP_PATH,
  ...SIGNUP_ALIASES,
])

/** Query keys marketing and gated tools put on /signup and /login. */
export const AUTH_PRESERVED_QUERY_KEYS = [
  "returnTo",
  "redirect",
  "ref",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const

function firstParam(
  input: Record<string, string | string[] | undefined> | URLSearchParams,
  key: string,
): string {
  if (input instanceof URLSearchParams) return input.get(key) ?? ""
  const value = input[key]
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

function pathnameOf(raw: string): string {
  return raw.split("?")[0]?.split("#")[0] ?? raw
}

/**
 * Whitelist a returnTo path to relative URLs only — never let a caller
 * push us to an external host (open-redirect protection). Auth-gate
 * paths fall back so /signup?returnTo=/signup cannot loop.
 */
export function safeReturnTo(
  raw: string | null | undefined,
  fallback = "/analyse",
): string {
  if (!raw) return fallback
  if (!raw.startsWith("/")) return fallback
  if (raw.startsWith("//")) return fallback
  if (AUTH_GATE_PATHS.has(pathnameOf(raw))) return fallback
  return raw
}

/** Signed-in visitors on /signup land on returnTo/redirect, else /account. */
export function signedInSignupDestination(
  returnTo?: string | null,
  redirect?: string | null,
): string {
  return safeReturnTo(returnTo || redirect, "/account")
}

export function authQueryString(
  input: Record<string, string | string[] | undefined> | URLSearchParams,
): string {
  const params = new URLSearchParams()
  const keys =
    input instanceof URLSearchParams
      ? Array.from(
          new Set([
            ...AUTH_PRESERVED_QUERY_KEYS,
            ...Array.from(input.keys()).filter(
              (key) =>
                key.startsWith("utm_") ||
                key === "returnTo" ||
                key === "redirect" ||
                key === "ref",
            ),
          ]),
        )
      : [...AUTH_PRESERVED_QUERY_KEYS]

  for (const key of keys) {
    const value = firstParam(input, key)
    if (value) params.set(key, value)
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ""
}

export function signupPathFromQuery(
  input: Record<string, string | string[] | undefined> | URLSearchParams,
): string {
  return `${SIGNUP_PATH}${authQueryString(input)}`
}

export function loginPathFromQuery(
  input: Record<string, string | string[] | undefined> | URLSearchParams,
): string {
  return `/login${authQueryString(input)}`
}
