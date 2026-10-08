import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { mergeAuthCookieOptions } from '@/lib/supabase/cookieOptions'

/**
 * @param requestHeaderOverrides extra headers to forward to the app on the
 *   REQUEST (not the response) — used to pass the per-request CSP nonce, which
 *   Next.js reads in order to stamp its own inline scripts. Rebuilt on every
 *   NextResponse.next() so cookie updates written by setAll are preserved.
 */
export async function updateSession(
  request: NextRequest,
  requestHeaderOverrides?: Record<string, string>,
) {
  const nextInit = () => {
    if (!requestHeaderOverrides) return { request }
    const headers = new Headers(request.headers)
    for (const [key, value] of Object.entries(requestHeaderOverrides)) {
      headers.set(key, value)
    }
    return { request: { headers } }
  }

  let supabaseResponse = NextResponse.next(nextInit())

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next(nextInit())
          // sameSite: 'lax' (not 'strict') — strict drops the session
          // cookie on cross-site top-level navigations (e.g. the OAuth
          // round-trip back from supabase.co), leaving users
          // logged-out after a successful sign-in. mergeAuthCookieOptions
          // keeps Supabase maxAge: 0 so chunk deletions actually delete.
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, mergeAuthCookieOptions(options)),
          )
        },
      },
    },
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getUser() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
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

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
