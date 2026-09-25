import type { CookieOptions } from "@supabase/ssr"

/**
 * Overlay Metalyzi security flags onto Supabase cookie writes.
 *
 * MUST keep Supabase's `maxAge` / `expires`. @supabase/ssr deletes stale
 * chunked `sb-*-auth-token.N` cookies by setting `value=""` and
 * `maxAge: 0`. Forcing a 7-day maxAge on those writes leaves empty
 * chunks in the browser; the next getAll() concatenates garbage and
 * the session looks signed-out site-wide.
 *
 * Same overlay as app/auth/callback/route.ts and lib/supabase/proxy.ts.
 */
export function mergeAuthCookieOptions(
  incoming?: CookieOptions,
): CookieOptions {
  return {
    ...incoming,
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  }
}

export function isCookieDeletion(cookie: {
  value: string
  options?: CookieOptions
}): boolean {
  if (cookie.value === "" || cookie.options?.maxAge === 0) return true
  const expires = cookie.options?.expires
  if (expires instanceof Date && expires.getTime() <= 0) return true
  return false
}
