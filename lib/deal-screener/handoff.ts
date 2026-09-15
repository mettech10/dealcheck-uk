import { SCHEMA_VERSION, type HandoffRequestV1, type HandoffResponseV1, type NormalisedListingV1, type StrategyHint } from "./types"
import { stripPhotos } from "./normalize"
import { normaliseStrategyHint } from "./strategy"

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim()
}

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number(v.replace(/[£,\s]/g, ""))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function asInt(v: unknown): number | null {
  const n = asNum(v)
  return n == null ? null : Math.trunc(n)
}

export function idempotencyKey(
  source: string,
  sourceListingId: string,
): string {
  return `screener:${source}:${sourceListingId}`
}

/**
 * Build Idempotency-Key, synthesising `screener:{source}:{sourceListingId}`
 * when the caller omitted the header (Flask does the same).
 */
export function resolveIdempotencyKey(
  headerValue: string | null | undefined,
  source: string,
  sourceListingId: string,
): string {
  const header = (headerValue || "").trim()
  if (header) return header
  return idempotencyKey(source || "unknown", sourceListingId)
}

/**
 * Flatten aliases into Flask canonical listing fields.
 * listingUrl ← sourceUrl; priceGbp ← price; rentPcmGbp ← monthlyRent;
 * bedrooms ← beds.
 */
export function toFlaskListing(
  raw: NormalisedListingV1 | Record<string, unknown>,
): NormalisedListingV1 {
  const r = asRecord(raw) ?? {}
  const listingUrl =
    asStr(r.listingUrl) || asStr(r.sourceUrl) || asStr(r.url)
  const sourceListingId =
    asStr(r.sourceListingId) || asStr(r.listingId) || ""
  const priceGbp = asInt(r.priceGbp ?? r.price ?? r.purchasePrice) ?? 0
  const rentRaw = asNum(r.rentPcmGbp ?? r.monthlyRent ?? r.rent)
  const bedrooms = asInt(r.bedrooms ?? r.beds)
  const bathrooms = asInt(r.bathrooms ?? r.baths)

  const listing: NormalisedListingV1 = {
    source: (asStr(r.source).toLowerCase() || "rightmove") as NormalisedListingV1["source"],
    sourceListingId,
    listingUrl,
    address: asStr(r.address),
    postcode: asStr(r.postcode),
    priceGbp,
    rentPcmGbp: rentRaw != null && rentRaw > 0 ? rentRaw : null,
    bedrooms,
    bathrooms,
    propertyType: asStr(r.propertyType) || null,
    tenure: asStr(r.tenure) || null,
    leaseYearsRemaining: asInt(r.leaseYearsRemaining),
    floorSizeSqft: asInt(r.floorSizeSqft),
    floorSizeM2: asNum(r.floorSizeM2),
    description: asStr(r.description) || null,
    keyFeatures: Array.isArray(r.keyFeatures)
      ? r.keyFeatures.map((f) => String(f)).filter(Boolean)
      : [],
    epcRating: asStr(r.epcRating || r.epc) || null,
    councilTaxBand: asStr(r.councilTaxBand) || null,
    agentName: asStr(r.agentName) || null,
    agentPhone: asStr(r.agentPhone) || null,
    isSold: Boolean(r.isSold),
    isUnderOffer: Boolean(r.isUnderOffer),
    isReduced: Boolean(r.isReduced),
    capturedAt: asStr(r.capturedAt) || new Date().toISOString(),
  }

  return stripPhotos(listing as unknown as Record<string, unknown>) as unknown as NormalisedListingV1
}

export function buildHandoffRequest(
  listing: NormalisedListingV1 | Record<string, unknown>,
  strategyHint?: StrategyHint | string | null,
): HandoffRequestV1 {
  const canonical = toFlaskListing(listing)
  if (!canonical.sourceListingId && !canonical.listingUrl && !canonical.address) {
    throw new Error("listing must include address, listingUrl, or sourceListingId")
  }
  if (canonical.rentPcmGbp == null || !(canonical.rentPcmGbp > 0)) {
    throw new Error("rentPcmGbp is required (user-entered monthly rent)")
  }

  const hint = normaliseStrategyHint(strategyHint ?? "")
  if (hint == null) {
    throw new Error(`Invalid strategyHint: ${String(strategyHint)}`)
  }

  const body: HandoffRequestV1 = {
    source: "screener",
    schemaVersion: SCHEMA_VERSION,
    listing: canonical,
  }
  // Omit btl so Flask applies the same default as an empty hint.
  if (hint !== "btl") body.strategyHint = hint
  return body
}

export function parseHandoffResponse(raw: unknown): HandoffResponseV1 {
  const r = asRecord(raw)
  if (!r) throw new Error("Empty handoff response")
  const dealId = asStr(r.dealId)
  const deepLinkPath = asStr(r.deepLinkPath)
  if (!dealId) throw new Error("No dealId in response")
  if (!deepLinkPath) throw new Error("No deepLinkPath in response")
  const status = r.status === "existing" ? "existing" : "created"
  const propertyId = asStr(r.propertyId) || undefined
  return { dealId, propertyId, status, deepLinkPath }
}

/** Open the Flask-returned path on the Metalyzi app origin. */
export function resolveDeepLinkUrl(appOrigin: string, deepLinkPath: string): string {
  if (/^https?:\/\//i.test(deepLinkPath)) return deepLinkPath
  const origin = appOrigin.replace(/\/$/, "")
  const path = deepLinkPath.startsWith("/") ? deepLinkPath : `/${deepLinkPath}`
  return `${origin}${path}`
}
