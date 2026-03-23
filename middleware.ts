import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/proxy"

// Secret key for developer access
const DEV_SECRET = "metalyzi2026"

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "https://metalyzi.co.uk",
  "https://www.metalyzi.co.uk",
  "http://localhost:3000",
]

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Handle CORS preflight
  const origin = request.headers.get("origin")
  const isAllowedOrigin = !origin || ALLOWED_ORIGINS.includes(origin)

  // Check for dev access key in URL
  const hasDevKey = searchParams.get("dev") === DEV_SECRET

  // If dev key is present, set a cookie and allow access
  if (hasDevKey) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: any
    try {
      response = await updateSession(request)
    } catch {
      // If Supabase is unavailable, still grant dev access without session refresh
      response = NextResponse.next({ request })
    }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let apiResponse: any
    try {
      apiResponse = await updateSession(request)
    } catch {
      apiResponse = NextResponse.next({ request })
    }
    // Add CORS headers for API routes
    if (pathname.startsWith("/api/")) {
      if (isAllowedOrigin && origin) {
        apiResponse.headers.set("Access-Control-Allow-Origin", origin)
      }
      apiResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
      apiResponse.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
      apiResponse.headers.set("Access-Control-Allow-Credentials", "true")
    }
    return apiResponse
  }

  // If has dev cookie, allow access to everything (but refresh session)
  if (hasDevCookie) {
    try { return await updateSession(request) } catch { return NextResponse.next({ request }) }
  }

  // Redirect to coming-soon if not allowed
  if (!isAllowed) {
    return NextResponse.redirect(new URL("/coming-soon", request.url))
  }

  try { return await updateSession(request) } catch { return NextResponse.next({ request }) }
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