/**
 * Flask (metusa-deal-analyzer) is the canonical MTD Pack API.
 * Same SoT pattern as Screener → Flask /v1/deals: this Next app never
 * owns mtd_* ledger tables.
 */
export const DEFAULT_ANALYZER_API_URL = "https://metusa-deal-analyzer.onrender.com"

export function analyzerApiUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_ANALYZER_API_URL ||
    process.env.ANALYZER_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    process.env.BACKEND_API_URL ||
    DEFAULT_ANALYZER_API_URL
  return raw.replace(/\/$/, "")
}

export function flaskMtdUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${analyzerApiUrl()}/v1/mtd${suffix}`
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
