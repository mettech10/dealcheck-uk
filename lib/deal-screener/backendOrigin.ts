/**
 * Flask Deal Analyser origin for Screener → Analyser handoff.
 *
 * Canonical create is Flask POST `{origin}/v1/deals`
 * (metusa-deal-analyzer PR #92). Never Next `/api/v1/deals`.
 * Never `screener_deals`.
 *
 * Env precedence (first non-empty wins):
 *   NEXT_PUBLIC_ANALYZER_API_URL → METUSA_API_URL → BACKEND_API_URL
 */

export const DEFAULT_FLASK_BACKEND_ORIGIN =
  "https://metusa-deal-analyzer.onrender.com"

type EnvMap = Record<string, string | undefined>

export function resolveFlaskBackendOrigin(env: EnvMap = process.env): string {
  return (
    trimOrigin(env.NEXT_PUBLIC_ANALYZER_API_URL) ||
    trimOrigin(env.METUSA_API_URL) ||
    trimOrigin(env.BACKEND_API_URL) ||
    DEFAULT_FLASK_BACKEND_ORIGIN
  )
}

export function flaskDealsUrl(
  origin?: string | null,
  env: EnvMap = process.env,
): string {
  const base = trimOrigin(origin) || resolveFlaskBackendOrigin(env)
  return `${base}/v1/deals`
}

/** True when a URL is the retired Next create path (must not be used). */
export function isNextDealsCreatePath(url: string): boolean {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\/$/, "")
    if (path === "/api/v1/deals") return true
    // App-origin `/v1/deals` was a Next rewrite — not Flask.
    if (path === "/v1/deals" && isMetalyziAppOrigin(parsed.origin)) return true
    return false
  } catch {
    return url.includes("/api/v1/deals")
  }
}

function isMetalyziAppOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin)
    const host = parsed.hostname.replace(/^www\./, "")
    if (host === "metalyzi.co.uk") return true
    if (host === "localhost" || host === "127.0.0.1") {
      return parsed.port === "3000" || parsed.port === ""
    }
    return false
  } catch {
    return /metalyzi\.co\.uk/i.test(origin)
  }
}

function trimOrigin(raw: string | null | undefined): string {
  if (typeof raw !== "string") return ""
  return raw.trim().replace(/\/$/, "")
}
