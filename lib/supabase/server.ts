import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { mergeAuthCookieOptions } from "@/lib/supabase/cookieOptions"

/**
 * Secure Supabase server client with HttpOnly cookies.
 *
 * Cookie writes MUST go through mergeAuthCookieOptions so chunk deletions
 * (`value=""`, `maxAge: 0`) are not persisted as empty 7-day cookies.
 * That clobber signed users out of the whole site after /screener/connect
 * called getUser()/getSession() in a Route Handler or a redirecting RSC.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, mergeAuthCookieOptions(options)),
            )
          } catch {
            // The "setAll" method was called from a Server Component.
            // This can be ignored if you have proxy refreshing
            // user sessions.
          }
        },
      },
    },
  )
}

/**
 * Same cookie read path, but never writes. Use on routes that must not
 * rotate or clear the session (screener connect + token mint).
 */
export async function createReadOnlyClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // Intentionally empty — do not clobber chunked session cookies.
        },
      },
    },
  )
}
