import type { MetadataRoute } from "next"

// Deliberate public-page allowlist: never enumerate saved deals, accounts,
// admin routes or token-based report links. No fabricated modification dates.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "/",
    "/masterclass",
    "/tools/sdlt-calculator",
    "/privacy-policy",
    "/cookie-policy",
    "/terms-of-service",
    "/disclaimer",
    "/refund-policy",
    "/legal",
  ].map((path) => ({ url: `https://www.metalyzi.co.uk${path}` }))
}
