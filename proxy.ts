import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { updateSession } from "@/lib/supabase/proxy"
import { isAdminEmail } from "@/lib/admin"

/**
 * Edge proxy.
 *
 * Two jobs:
 *   1. Admin gate — anything under `/admin/*` must be from an
 *      authenticated user whose email is in ADMIN_EMAILS. Anyone
 *      else gets bounced (anon → /login, signed-in non-admin → /).
 *   2. Refresh Supabase session cookies on every request via
 *      updateSession() so the user stays signed in across browser
 *      sessions.
 *
 * The legacy "coming-soon" wall + dev-secret bypass was removed
 * 2026-05-28 because it blocked all real visitors (the homepage,
 * /analyse, /account, /pricing etc. were not in the allow-list)
 * and the secret was leaked in several page-source HTML links.
 * If you need a pre-launch gate again, do it as an env-gated
 * feature flag in this file, not a hardcoded string.
 */

const ADMIN_PATH_PREFIX = "/admin"

const ALLOWED_ORIGINS = [
  "https://metalyzi.co.uk",
  "https://www.metalyzi.co.uk",
  "http://localhost:3000",
]

function isAllowedApiOrigin(origin: string | null): boolean {
  if (!origin) return true
  if (ALLOWED_ORIGINS.includes(origin)) return true
  // Closed-beta Deal Screener MV3 extension (unpacked; origin is chrome-extension://<id>)
  return origin.startsWith("chrome-extension://")
}

function isScreenerApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/v1/") || pathname.startsWith("/v1/")
}

/**
 * Admin gate — runs first for /admin/*. Returns a NextResponse to
 * short-circuit when access denied, or `null` to let the rest of
 * the proxy proceed.
 */
async function gateAdmin(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl
  if (!pathname.startsWith(ADMIN_PATH_PREFIX)) return null

  // Inline Supabase client bound to a response we can return cookies
  // on. Cheaper than updateSession (no full refresh write path) and
  // doesn't fight the existing flow.
  const response = NextResponse.next({ request })
  const isProd = process.env.NODE_ENV === "production"
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            const final: CookieOptions = {
              ...options,
              path: "/",
              httpOnly: true,
              secure: isProd,
              sameSite: "lax",
            }
            response.cookies.set(name, value, final)
          }
        },
      },
    },
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = `?returnTo=${encodeURIComponent(pathname)}`
    const redirect = NextResponse.redirect(url)
    for (const c of response.cookies.getAll()) redirect.cookies.set(c)
    return redirect
  }

  if (!isAdminEmail(user.email)) {
    // Silently bounce to homepage — don't leak admin gate existence
    // to non-admin signed-in users.
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.search = ""
    const redirect = NextResponse.redirect(url)
    for (const c of response.cookies.getAll()) redirect.cookies.set(c)
    return redirect
  }

  return null
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Admin gate first — must short-circuit before anything else.
  const adminRedirect = await gateAdmin(request)
  if (adminRedirect) return adminRedirect

  // 2. CORS preflight + session refresh for API routes and static.
  const origin = request.headers.get("origin")
  const isAllowedOrigin = isAllowedApiOrigin(origin)

  if (request.method === "OPTIONS" && isScreenerApiPath(pathname)) {
    const preflight = new NextResponse(null, { status: 204 })
    if (isAllowedOrigin && origin) {
      preflight.headers.set("Access-Control-Allow-Origin", origin)
    }
    preflight.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    preflight.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Idempotency-Key",
    )
    preflight.headers.set("Access-Control-Max-Age", "86400")
    preflight.headers.set("Vary", "Origin")
    return preflight
  }

  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/v1/") ||
    pathname.startsWith("/static/") ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js)$/)
  ) {
    const response = await updateSession(request)
    if (pathname.startsWith("/api/") || pathname.startsWith("/v1/")) {
      if (isAllowedOrigin && origin) {
        response.headers.set("Access-Control-Allow-Origin", origin)
      }
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
      response.headers.set(
        "Access-Control-Allow-Headers",
        isScreenerApiPath(pathname)
          ? "Content-Type, Authorization, Idempotency-Key"
          : "Content-Type, Authorization",
      )
      if (!origin?.startsWith("chrome-extension://")) {
        response.headers.set("Access-Control-Allow-Credentials", "true")
      }
      response.headers.set("Vary", "Origin")
    }
    return response
  }

  // 3. Everything else — refresh the Supabase session and pass
  //    through. No coming-soon wall, no dev-secret check.
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
