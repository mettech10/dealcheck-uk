/**
 * Flask (metusa-deal-analyzer) is the canonical MTD Pack API.
 * Same SoT pattern as Screener → Flask /v1/deals: this Next app never
 * owns mtd_* ledger tables.
 *
 * Browser calls same-origin `/api/mtd/*` (BFF). The BFF forwards to
 * Flask `/v1/mtd/*` with the signed-in user's Bearer token. Direct
 * browser → Flask was the live QA P0: CSP/CORS "Failed to fetch" and
 * a false unauthenticated gate when `/api/mtd/token` 401'd.
 */

export const DEFAULT_ANALYZER_API_URL = "https://metusa-deal-analyzer.onrender.com"

/** Same-origin BFF prefix — the only authenticated ledger path the browser uses. */
export const MTD_BFF_PREFIX = "/api/mtd"

const ANALYZER_ENV_KEYS = [
  "ANALYZER_API_URL",
  "BACKEND_API_URL",
  "NEXT_PUBLIC_ANALYZER_API_URL",
  "NEXT_PUBLIC_BACKEND_API_URL",
  "METUSA_API_URL",
] as const

type EnvMap = Record<string, string | undefined>

function trimOrigin(raw: string | null | undefined): string {
  if (typeof raw !== "string") return ""
  return raw.trim().replace(/\/+$/, "")
}

export function analyzerEnvSource(env: EnvMap = process.env): {
  url: string
  key: (typeof ANALYZER_ENV_KEYS)[number] | "default"
  fromEnv: boolean
} {
  for (const key of ANALYZER_ENV_KEYS) {
    const url = trimOrigin(env[key])
    if (url) return { url, key, fromEnv: true }
  }
  return { url: DEFAULT_ANALYZER_API_URL, key: "default", fromEnv: false }
}

export function analyzerApiUrl(env: EnvMap = process.env): string {
  return analyzerEnvSource(env).url
}

export function flaskMtdUrl(path: string, env: EnvMap = process.env): string {
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${analyzerApiUrl(env)}/v1/mtd${suffix}`
}

/** Browser ledger path. Never a Flask origin — cookies stay first-party. */
export function mtdBffUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${MTD_BFF_PREFIX}${suffix}`
}

export function analyzerMissingEnvMessage(): string {
  return (
    `Flask MTD origin is not set. Set ANALYZER_API_URL or BACKEND_API_URL on Vercel ` +
    `(server env) to the Flask host, typically ${DEFAULT_ANALYZER_API_URL}. ` +
    `NEXT_PUBLIC_ANALYZER_API_URL is optional now that the ledger uses the Next BFF. ` +
    `Next.js does not own mtd_* tables.`
  )
}

export function analyzerUnreachableMessage(url: string): string {
  return (
    `Could not reach the Flask MTD API at ${url}/v1/mtd. ` +
    `Ledger data is not stored in Next.js. Confirm ANALYZER_API_URL / BACKEND_API_URL ` +
    `on Vercel points at metusa-deal-analyzer (default ${DEFAULT_ANALYZER_API_URL}).`
  )
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isPlatformPropertyId(value: string | null | undefined): boolean {
  return Boolean(value && UUID_RE.test(value.trim()))
}

/** P1: create/link payloads must carry the Metalyzi portfolio propertyId. */
export function requirePlatformPropertyId(value: string | null | undefined): string {
  const id = (value || "").trim()
  if (!isPlatformPropertyId(id)) {
    throw new Error("propertyId is required (Metalyzi portfolio property UUID).")
  }
  return id
}

export function flaskPropertyLinkBody(input: {
  propertyId: string
  label: string
  address?: string | null
  postcode?: string | null
  occupancyType?: "residential" | "non_residential" | "mixed"
}) {
  const propertyId = requirePlatformPropertyId(input.propertyId)
  return {
    propertyId,
    property_id: propertyId,
    label: input.label,
    address: input.address ?? null,
    postcode: input.postcode ?? null,
    occupancyType: input.occupancyType ?? "residential",
  }
}
