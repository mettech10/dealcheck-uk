import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { updateSession } from "@/lib/supabase/proxy"
import { isAdminEmail } from "@/lib/admin"

// Secret key for developer access
const DEV_SECRET = "metalyzi2026"

const ADMIN_PATH_PREFIX = "/admin"

/**
 * Admin gate — runs ahead of the dev/coming-soon flow so admin routes
 * are protected even with the dev key. Returns a NextResponse to
 * short-circuit the proxy when access is denied, or `null` to let the
 * rest of the proxy proceed.
 *
 * Rules:
 *   - Unauthenticated → /login?returnTo=<pathname>
 *   - Authenticated but email not in ADMIN_EMAILS → /
 *   - Authenticated and on allow-list → null (continue)
 */
async function gateAdmin(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl
  if (!pathname.startsWith(ADMIN_PATH_PREFIX)) return null

  // Inline Supabase client bound to a response we can return cookies
  // on. Cheaper than updateSession (no full refresh write path) and
  // doesn't fight the existing flow.
  let response = NextResponse.next({ request })
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

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "https://metalyzi.co.uk",
  "https://www.metalyzi.co.uk",
  "http://localhost:3000",
]

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Admin gate runs first — must short-circuit before the
  // dev-key / coming-soon flow so admins can't be bypassed by either
  // and non-admins can't slip through with a dev cookie.
  const adminRedirect = await gateAdmin(request)
  if (adminRedirect) return adminRedirect

  // Handle CORS preflight
  const origin = request.headers.get("origin")
  const isAllowedOrigin = !origin || ALLOWED_ORIGINS.includes(origin)

  // Check for dev access key in URL
  const hasDevKey = searchParams.get("dev") === DEV_SECRET

  // If dev key is present, set a cookie and allow access
  if (hasDevKey) {
    const response = await updateSession(request)
    response.cookies.set("dev_access", DEV_SECRET, {
      maxAge: 60 * 60 * 24 * 7, // 7 days
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    })
    return response
  }

  // Check if dev cookie is present
  const devCookie = request.cookies.get("dev_access")?.value
  const hasDevCookie = devCookie === DEV_SECRET

  // Allow list - these paths are always accessible
  const allowedPaths = [
    "/waitlist",
    "/coming-soon",
    "/api/waitlist",
    "/api/auth",
    "/auth/callback",
    "/auth/verified",
    "/login",
    "/_next",
    "/favicon.ico",
    "/logo.png",
    "/icon.svg",
    "/robots.txt",
    "/.well-known/security.txt",
  ]

  // Check if the current path is allowed
  const isAllowed = allowedPaths.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  )

  // Allow static files and API routes — but still run updateSession to keep auth fresh
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/static/") ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js)$/)
  ) {
    const response = await updateSession(request)
    
    // Add CORS headers for API routes
    if (pathname.startsWith("/api/")) {
      if (isAllowedOrigin && origin) {
        response.headers.set("Access-Control-Allow-Origin", origin)
      }
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
      response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
      response.headers.set("Access-Control-Allow-Credentials", "true")
    }
    
    return response
  }

  // If has dev cookie, allow access to everything (but refresh session)
  if (hasDevCookie) {
    return await updateSession(request)
  }

  // Redirect to coming-soon if not allowed
  if (!isAllowed) {
    return NextResponse.redirect(new URL("/coming-soon", request.url))
  }

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