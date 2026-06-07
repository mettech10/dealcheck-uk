import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Secure Supabase server client with HttpOnly cookies
 * This prevents XSS attacks from stealing session tokens
 */
export async function createClient() {
  const cookieStore = await cookies()

  // Secure cookie options
  const cookieOptions = {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,  // ← CRITICAL: Prevents XSS access to cookies
    // `lax`, not `strict` — `strict` strips the cookie on cross-site
    // top-level navigations (e.g. the redirect from supabase.co back
    // to our origin after Google OAuth), which left users logged out
    // after a successful sign-in. `lax` keeps it for top-level
    // navigations while still blocking it on cross-site XHR/iframe.
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  }

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
            cookiesToSet.forEach(({ name, value }) =>
              cookieStore.set(name, value, cookieOptions),
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