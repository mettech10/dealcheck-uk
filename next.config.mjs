const analyzerOrigin = (() => {
  const raw =
    process.env.NEXT_PUBLIC_ANALYZER_API_URL ||
    process.env.ANALYZER_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    process.env.BACKEND_API_URL ||
    "https://metusa-deal-analyzer.onrender.com"
  try {
    return new URL(raw).origin
  } catch {
    return "https://metusa-deal-analyzer.onrender.com"
  }
})()

const analyzerConnectSrc = Array.from(
  new Set([
    analyzerOrigin,
    "https://metusa-deal-analyzer.onrender.com",
    "https://analyzer.metusaproperty.co.uk",
  ]),
).join(" ")

/**
 * Third-party origins the browser must be allowed to load.
 *
 * These were missing, and the CSP silently broke two live features:
 *   • Crisp — client.crisp.chat was blocked, so the support widget never
 *     rendered in production at all, while the beta banner was telling
 *     users to "report any issues via the chat widget".
 *   • Convex website analytics — the beacon in app/layout.tsx was blocked,
 *     so it has never recorded a single page view.
 * Verified against www.metalyzi.co.uk before changing anything.
 *
 * Crisp's own requirements: script/style/font from client.crisp.chat, plus
 * websockets to its relay for live chat. Vercel Analytics and Speed
 * Insights are same-origin in production (/_vercel/*) but load from
 * va.vercel-scripts.com in development, hence that origin too.
 */
const CRISP_ORIGIN = "https://client.crisp.chat"
const CRISP_SOCKETS = "wss://client.relay.crisp.chat wss://stream.relay.crisp.chat"
const CONVEX_ANALYTICS_ORIGIN = "https://aromatic-caribou-889.convex.site"
const VERCEL_SCRIPTS = "https://va.vercel-scripts.com"
const VERCEL_VITALS = "https://vitals.vercel-insights.com"

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // tsc is clean as of 2026-06-10 — keep it that way; builds fail on
    // type errors so credit/payment regressions surface before deploy.
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  // playwright-core loads browsers.json (and other assets) with dynamic
  // requires that Vercel's file tracer can't follow — without this the
  // scraper routes crash at import with "Cannot find module
  // .../playwright-core/browsers.json". Keep it external and force the
  // whole package into the traced output for the scraper functions.
  serverExternalPackages: ['playwright-core'],
  outputFileTracingIncludes: {
    '/api/scraper/listing': ['./node_modules/playwright-core/**'],
    '/api/scraper/search': ['./node_modules/playwright-core/**'],
    '/api/scraper/sold': ['./node_modules/playwright-core/**'],
    '/api/comparables/sold': ['./node_modules/playwright-core/**'],
    '/api/comparables/rental-listings': ['./node_modules/playwright-core/**'],
  },
  async rewrites() {
    return [
      // GET hydrate only — Flask POST {be}/v1/deals is the create SoT.
      { source: '/v1/deals/:id', destination: '/api/v1/deals/:id' },
      // Public alias of the Next proxy (Flask remains the licensing SoT).
      { source: '/v1/licensing/check', destination: '/api/v1/licensing/check' },
      {
        source: "/v1/ltd-co/compare",
        destination: "/api/v1/ltd-co/compare",
      },
    ]
  },
  // Old static admin HTML used to live at /admin/admin_dashboard.html
  // and /admin/admin_login.html, exposed via rewrites at /admin/dashboard
  // and /admin/login. The new Next.js dashboard at /admin replaces
  // both. These redirects make sure existing bookmarks land on the
  // new app instead of 404-ing or hitting a stale static file.
  async redirects() {
    return [
      { source: '/admin/dashboard', destination: '/admin', permanent: true },
      { source: '/admin/login', destination: '/login?returnTo=/admin', permanent: true },
      // Canonical MTD Pack is /mtd. /tools/mtd 404'd in live QA because
      // other tools live under /tools/*. Keep bookmarks working.
      { source: '/tools/mtd', destination: '/mtd', permanent: true },
      { source: '/tools/mtd/:path*', destination: '/mtd/:path*', permanent: true },
      // Marketing aliases — canonical sign-up is /signup (query string is kept).
      { source: '/register', destination: '/signup', permanent: true },
      { source: '/sign-up', destination: '/signup', permanent: true },
    ]
  },
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-eval' 'unsafe-inline' ${CRISP_ORIGIN} ${CONVEX_ANALYTICS_ORIGIN} ${VERCEL_SCRIPTS}`,
              `style-src 'self' 'unsafe-inline' ${CRISP_ORIGIN}`,
              // blob: — client-generated share-card PNG previews
              "img-src 'self' data: blob: https:",
              `font-src 'self' ${CRISP_ORIGIN}`,
              // Crisp plays a notification sound on new messages.
              `media-src 'self' ${CRISP_ORIGIN}`,
              `connect-src 'self' https://*.supabase.co https://api.brevo.com https://r.jina.ai https://api.openai.com ${analyzerConnectSrc} ${CRISP_ORIGIN} ${CRISP_SOCKETS} ${CONVEX_ANALYTICS_ORIGIN} ${VERCEL_VITALS} ${VERCEL_SCRIPTS} http://localhost:5000 http://127.0.0.1:5000`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ]
  },
}

export default nextConfig