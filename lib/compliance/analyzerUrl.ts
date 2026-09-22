/**
 * Flask origin for the Compliance Cockpit BFF.
 *
 * Aligns with MTD / Screener aliases so a Vercel project that only
 * has NEXT_PUBLIC_ANALYZER_API_URL (the documented key) still reaches
 * /v1/compliance/*. Empty env falls back to the Render service — never
 * invent a second store.
 */

export const DEFAULT_COMPLIANCE_ANALYZER_URL =
  "https://metusa-deal-analyzer.onrender.com"

const URL_KEYS = [
  "ANALYZER_API_URL",
  "ANALYZER_URL",
  "NEXT_PUBLIC_ANALYZER_API_URL",
  "METUSA_API_URL",
  "BACKEND_API_URL",
  "NEXT_PUBLIC_BACKEND_API_URL",
] as const

type EnvMap = Record<string, string | undefined>

function trimOrigin(raw: string | null | undefined): string {
  if (typeof raw !== "string") return ""
  return raw.trim().replace(/\/+$/, "")
}

export function resolveComplianceAnalyzerUrl(
  env: EnvMap = process.env,
): string {
  for (const key of URL_KEYS) {
    const origin = trimOrigin(env[key])
    if (origin) return origin
  }
  return DEFAULT_COMPLIANCE_ANALYZER_URL
}

export function complianceUpstreamUrl(
  path: string,
  search = "",
  env: EnvMap = process.env,
): string {
  const base = resolveComplianceAnalyzerUrl(env)
  const suffix = path.replace(/^\/+/, "")
  return `${base}/v1/compliance/${suffix}${search}`
}
