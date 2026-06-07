import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Check if Supabase env vars are configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // Supabase not configured - allow request to proceed without auth
    console.warn('[middleware] Supabase env vars not configured')
    return supabaseResponse
  }

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            )
            supabaseResponse = NextResponse.next({
              request,
            })
            // sameSite: 'lax' (not 'strict') — strict drops the session
            // cookie on cross-site top-level navigations (e.g. the OAuth
            // round-trip back from supabase.co), leaving users
            // logged-out after a successful sign-in. Must stay in sync
            // with lib/supabase/server.ts and app/auth/callback/route.ts
            // — if any one of these writes strict, every other code path
            // gets clobbered on the next session refresh.
            const secureCookieOptions = {
              path: '/',
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax' as const,
            }
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, { ...options, ...secureCookieOptions }),
            )
          },
        },
      },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (
      request.nextUrl.pathname.startsWith('/analyse') &&
      !user
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  } catch (error) {
    // If Supabase auth fails, allow request to proceed
    // This prevents the entire site from breaking if Supabase is down
    console.error('[middleware] Supabase auth error:', error)
    return supabaseResponse
  }
}
