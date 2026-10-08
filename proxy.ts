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

/**
 * Content-Security-Policy, built per request so script-src can carry a nonce.
 *
 * This used to be a static header in next.config.mjs, which forced
 * script-src to include 'unsafe-inline' — that allows ANY injected inline
 * script to run and undoes most of what a CSP is for. A fresh nonce per
 * response means only scripts we emitted can execute. Next.js reads the
 * nonce from the CSP on the REQUEST headers and stamps its own inline
 * bootstrap/flight scripts with it; next-themes' pre-paint script is nonced
 * explicitly in app/layout.tsx.
 *
 * 'unsafe-eval' stays in development only — React Refresh and Turbopack HMR
 * need it; production bundles do not.
 *
 * style-src keeps 'unsafe-inline' deliberately: Next, Tailwind and Crisp all
 * write inline styles and there is no nonce path for them. Inline style is a
 * far smaller risk than inline script, so this is the usual trade-off.
 */
const CRISP_ORIGIN = "https://client.crisp.chat"
const CRISP_SOCKETS = "wss://client.relay.crisp.chat wss://stream.relay.crisp.chat"
const CONVEX_ANALYTICS_ORIGIN = "https://aromatic-caribou-889.convex.site"
const VERCEL_SCRIPTS = "https://va.vercel-scripts.com"
const VERCEL_VITALS = "https://vitals.vercel-insights.com"

function analyzerConnectSrc(): string {
  const raw =
    process.env.NEXT_PUBLIC_ANALYZER_API_URL ||
    process.env.ANALYZER_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    process.env.BACKEND_API_URL ||
    "https://metusa-deal-analyzer.onrender.com"
  let origin = "https://metusa-deal-analyzer.onrender.com"
  try {
    origin = new URL(raw).origin
  } catch {
    /* keep the default */
  }
  return Array.from(
    new Set([
      origin,
      "https://metusa-deal-analyzer.onrender.com",
      "https://analyzer.metusaproperty.co.uk",
    ]),
  ).join(" ")
}

/** Edge-safe random nonce — no Buffer in the edge runtime. */
function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production"
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""} ${CRISP_ORIGIN} ${CONVEX_ANALYTICS_ORIGIN} ${VERCEL_SCRIPTS}`,
    `style-src 'self' 'unsafe-inline' ${CRISP_ORIGIN}`,
    // blob: — client-generated share-card PNG previews
    "img-src 'self' data: blob: https:",
    `font-src 'self' ${CRISP_ORIGIN}`,
    // Crisp plays a notification sound on new messages.
    `media-src 'self' ${CRISP_ORIGIN}`,
    `connect-src 'self' https://*.supabase.co https://api.brevo.com https://r.jina.ai https://api.openai.com ${analyzerConnectSrc()} ${CRISP_ORIGIN} ${CRISP_SOCKETS} ${CONVEX_ANALYTICS_ORIGIN} ${VERCEL_VITALS} ${VERCEL_SCRIPTS} http://localhost:5000 http://127.0.0.1:5000`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ")
}


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

  // CSP nonce for this response. Applied to every path we return so no
  // route is left without a policy.
  const nonce = makeNonce()
  const csp = buildCsp(nonce)
  const nonceHeaders = { "x-nonce": nonce, "content-security-policy": csp }
  const withCsp = <T extends NextResponse>(res: T): T => {
    res.headers.set("content-security-policy", csp)
    return res
  }

  // 1. Admin gate first — must short-circuit before anything else.
  const adminRedirect = await gateAdmin(request)
  if (adminRedirect) return withCsp(adminRedirect)

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
    return withCsp(preflight)
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
    return withCsp(response)
  }

  // 3. Everything else — HTML. Forward the nonce on the REQUEST headers so
  //    Next.js can stamp its own inline scripts with it, and set the policy
  //    on the response for the browser.
  return withCsp(await updateSession(request, nonceHeaders))
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
