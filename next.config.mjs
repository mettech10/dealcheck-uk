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
  },
  async rewrites() {
    return []
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
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co https://api.brevo.com https://r.jina.ai https://api.openai.com",
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