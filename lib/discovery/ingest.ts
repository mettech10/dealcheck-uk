/**
 * Discovery ingestion — layers 1→3 of the pipeline.
 *
 *   L1  raw landing zone   every scraped payload is written as-is, with source
 *                          metadata, BEFORE any transformation. This is what
 *                          makes a bad score debuggable and a run replayable.
 *   L2  normalisation      canonical address, postcode/district, unit coercion,
 *                          geocoding, validation. Records missing mandatory
 *                          fields go to quarantine — never silently dropped,
 *                          never silently included.
 *   L3  canonical store    one `properties` row per real-world property shared
 *                          across every search and user, plus a
 *                          `property_listings` observation carrying price and
 *                          staleness (first_seen / last_seen / status).
 *
 * Everything here is deterministic and side-effect-explicit — no LLM, no
 * scoring. Screening (L4/L5) reads the canonical rows this produces.
 */
import { createHash } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { toDistrict } from "@/lib/discovery/areaIntel"

export type Supa = ReturnType<typeof createAdminClient>

/** A scraped listing card, in whatever shape the source returned it. */
export type RawCard = Record<string, unknown>

export interface IngestSource {
  /** e.g. "rightmove_search" */
  source: string
  /** 0..1 reliability. Search cards are partial, so they rank below a full page. */
  confidence?: number
}

/** What the screening layers consume — canonical, validated, deduped. */
export interface CanonicalListing {
  propertyId: string
  propertyKey: string
  listingUrl: string
  listingId: string | null
  address: string
  postcode: string
  district: string
  price: number
  bedrooms: number | null
  bathrooms: number | null
  propertyType: string | null
  thumbnailUrl: string | null
  description: string | null
  latitude: number | null
  longitude: number | null
}

export interface IngestSummary {
  runId: string
  rawWritten: number
  quarantined: number
  propertiesUpserted: number
  listings: CanonicalListing[]
}

// ── Normalisation helpers ──────────────────────────────────────────────────

const UK_POSTCODE_RE = /([A-Z]{1,2}[0-9][0-9A-Z]?)\s*([0-9][A-Z]{2})/i

/** Normalise a UK postcode to canonical "M13 9PL" form, or "" if not present. */
export function normalisePostcode(raw: string | null | undefined): string {
  if (!raw) return ""
  const m = String(raw).toUpperCase().match(UK_POSTCODE_RE)
  if (!m) return ""
  return `${m[1]} ${m[2]}`
}

/**
 * Canonical address for dedup: uppercase, punctuation stripped, whitespace
 * collapsed, and any trailing postcode removed (it is stored separately, and
 * sources are inconsistent about whether they append it).
 */
export function normaliseAddress(raw: string | null | undefined): string {
  if (!raw) return ""
  return String(raw)
    .toUpperCase()
    .replace(UK_POSTCODE_RE, " ")
    .replace(/[.,;:'"()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Dedup identity. The UK has no free parcel ID (UPRN needs an Ordnance Survey
 * licence), so a hash of normalised address + postcode is the practical key.
 */
export function propertyKey(address: string, postcode: string): string {
  return createHash("sha256")
    .update(`${normaliseAddress(address)}|${normalisePostcode(postcode) || postcode.toUpperCase()}`)
    .digest("hex")
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""))
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  return s === "" ? null : s
}

// ── Geocoding (postcodes.io — free, no key, UK only) ───────────────────────

const geoCache = new Map<string, { lat: number; lng: number } | null>()

/**
 * Resolve lat/lng for a postcode. Tries the full postcode, then falls back to
 * the outcode (search cards frequently carry only a district). Fails soft —
 * geocoding is an enrichment, never a reason to drop a listing.
 */
export async function geocodePostcode(
  postcode: string,
): Promise<{ lat: number; lng: number } | null> {
  const full = normalisePostcode(postcode)
  const outcode = (full || postcode || "").split(/\s+/)[0]?.toUpperCase() ?? ""
  const key = full || outcode
  if (!key) return null
  if (geoCache.has(key)) return geoCache.get(key) ?? null

  const urls = full
    ? [
        `https://api.postcodes.io/postcodes/${encodeURIComponent(full)}`,
        `https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`,
      ]
    : [`https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`]

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const json = (await res.json()) as { result?: { latitude?: number; longitude?: number } }
      const lat = json?.result?.latitude
      const lng = json?.result?.longitude
      if (typeof lat === "number" && typeof lng === "number") {
        const hit = { lat, lng }
        geoCache.set(key, hit)
        return hit
      }
    } catch {
      /* try the next fallback */
    }
  }
  geoCache.set(key, null)
  return null
}

/** Test seam — clears the per-process geocode cache. */
export function resetGeoCache(): void {
  geoCache.clear()
}

// ── L2: validate + normalise one raw card ──────────────────────────────────

export interface NormalisedCard {
  listingUrl: string
  listingId: string | null
  canonicalAddress: string
  displayAddress: string
  postcode: string
  district: string
  price: number
  bedrooms: number | null
  bathrooms: number | null
  propertyType: string | null
  tenure: string | null
  thumbnailUrl: string | null
  description: string | null
  priceText: string | null
  isReduced: boolean
  listedAt: string | null
}

export type NormaliseOutcome =
  | { ok: true; card: NormalisedCard }
  | { ok: false; missingFields: string[]; reason: string }

/**
 * Map a source card onto the unified schema. Mandatory: a listing URL, an
 * address we can canonicalise, and a positive price — without any of those the
 * record cannot be screened or deduped, so it is quarantined for inspection.
 */
export function normaliseCard(raw: RawCard, fallbackArea?: string): NormaliseOutcome {
  const listingUrl = str(raw.listingUrl) ?? str(raw.url)
  const displayAddress = str(raw.address) ?? ""
  const price = num(raw.price)

  const missing: string[] = []
  if (!listingUrl) missing.push("listingUrl")
  if (!displayAddress) missing.push("address")
  if (price === null || price <= 0) missing.push("price")

  if (missing.length > 0) {
    return {
      ok: false,
      missingFields: missing,
      reason: `mandatory field(s) missing: ${missing.join(", ")}`,
    }
  }

  // Postcode may live in the address, in its own field, or only as the area we
  // searched. Prefer the most specific available.
  const postcode =
    normalisePostcode(str(raw.postcode)) ||
    normalisePostcode(displayAddress) ||
    normalisePostcode(fallbackArea) ||
    (str(raw.postcode) ?? fallbackArea ?? "").toUpperCase()

  const district = toDistrict(postcode || fallbackArea || "")

  return {
    ok: true,
    card: {
      listingUrl: listingUrl!,
      listingId: str(raw.listingId),
      canonicalAddress: normaliseAddress(displayAddress),
      displayAddress,
      postcode,
      district,
      price: price!,
      bedrooms: num(raw.bedrooms),
      bathrooms: num(raw.bathrooms),
      propertyType: str(raw.propertyType),
      tenure: str(raw.tenure),
      thumbnailUrl: str(raw.thumbnailUrl),
      description: str(raw.description),
      priceText: str(raw.priceText),
      isReduced: raw.isReduced === true,
      listedAt: str(raw.addedDate),
    },
  }
}

// ── The pipeline ───────────────────────────────────────────────────────────

/**
 * Run raw cards through L1 → L2 → L3 and return canonical listings ready for
 * screening. Every step is recorded, so a run can be replayed from
 * discovery_raw_listings and a rejected record explains itself in
 * discovery_quarantine.
 */
export async function ingestListings(opts: {
  supabase: Supa
  runId: string
  searchId?: string | null
  cards: RawCard[]
  fallbackArea?: string
  geocode?: boolean
} & IngestSource): Promise<IngestSummary> {
  const { supabase, runId, searchId = null, cards, fallbackArea, source } = opts
  const confidence = opts.confidence ?? 0.7
  const shouldGeocode = opts.geocode !== false

  const summary: IngestSummary = {
    runId,
    rawWritten: 0,
    quarantined: 0,
    propertiesUpserted: 0,
    listings: [],
  }
  if (cards.length === 0) return summary

  // ── L1: land the raw payloads untouched ─────────────────────────────────
  const rawRows = cards.map((payload) => ({
    run_id: runId,
    search_id: searchId,
    source,
    source_url: (str(payload.listingUrl) ?? str(payload.url)) || null,
    scraped_at: new Date().toISOString(),
    confidence,
    payload,
  }))

  const { data: inserted, error: rawErr } = await supabase
    .from("discovery_raw_listings")
    .insert(rawRows)
    .select("id, payload")

  if (rawErr) {
    // If the raw write fails we must not carry on — the whole point is that
    // nothing is processed that wasn't first recorded.
    throw new Error(`raw landing write failed: ${rawErr.message}`)
  }

  const rawRecords = (inserted ?? []) as Array<{ id: string; payload: RawCard }>
  summary.rawWritten = rawRecords.length

  // ── L2: normalise + validate, quarantining anything unusable ────────────
  const good: Array<{ rawId: string; card: NormalisedCard }> = []
  const bad: Array<Record<string, unknown>> = []

  for (const rec of rawRecords) {
    const outcome = normaliseCard(rec.payload, fallbackArea)
    if (outcome.ok) {
      good.push({ rawId: rec.id, card: outcome.card })
    } else {
      bad.push({
        run_id: runId,
        raw_id: rec.id,
        source,
        source_url: (str(rec.payload.listingUrl) ?? str(rec.payload.url)) || null,
        payload: rec.payload,
        missing_fields: outcome.missingFields,
        reason: outcome.reason,
      })
    }
  }

  if (bad.length > 0) {
    await supabase.from("discovery_quarantine").insert(bad)
    summary.quarantined = bad.length
  }

  // Dedup within the batch: the same property can appear under two URLs.
  const byKey = new Map<string, { rawId: string; card: NormalisedCard }>()
  for (const g of good) {
    const key = propertyKey(g.card.displayAddress, g.card.postcode)
    if (!byKey.has(key)) byKey.set(key, g)
  }

  // ── L3: upsert canonical properties + listing observations ──────────────
  const now = new Date().toISOString()

  for (const [key, { rawId, card }] of byKey) {
    try {
      let lat: number | null = null
      let lng: number | null = null
      if (shouldGeocode) {
        const geo = await geocodePostcode(card.postcode || card.district)
        if (geo) {
          lat = geo.lat
          lng = geo.lng
        }
      }

      // Does this property already exist (from another search, or an earlier run)?
      const { data: existing } = await supabase
        .from("properties")
        .select("id, latitude, longitude")
        .eq("property_key", key)
        .maybeSingle()

      let propertyId: string
      if (existing) {
        const row = existing as { id: string; latitude: number | null; longitude: number | null }
        propertyId = row.id
        await supabase
          .from("properties")
          .update({
            last_seen: now,
            status: "active",
            updated_at: now,
            bedrooms: card.bedrooms ?? undefined,
            bathrooms: card.bathrooms ?? undefined,
            property_type: card.propertyType ?? undefined,
            // Only fill geo if we don't already have it.
            ...(row.latitude == null && lat != null ? { latitude: lat, longitude: lng } : {}),
          })
          .eq("id", propertyId)
      } else {
        const { data: created, error: insErr } = await supabase
          .from("properties")
          .insert({
            property_key: key,
            canonical_address: card.canonicalAddress || card.displayAddress,
            postcode: card.postcode || null,
            postcode_district: card.district || null,
            latitude: lat,
            longitude: lng,
            property_type: card.propertyType,
            bedrooms: card.bedrooms,
            bathrooms: card.bathrooms,
            tenure: card.tenure,
            first_seen: now,
            last_seen: now,
            status: "active",
          })
          .select("id")
          .single()
        if (insErr || !created) {
          console.warn("[ingest] property insert failed:", insErr?.message)
          continue
        }
        propertyId = (created as { id: string }).id
      }
      summary.propertiesUpserted++

      // Listing observation — one row per (property, source_url); re-scrapes
      // refresh price and last_seen rather than duplicating.
      const { data: existingListing } = await supabase
        .from("property_listings")
        .select("id")
        .eq("property_id", propertyId)
        .eq("source_url", card.listingUrl)
        .maybeSingle()

      if (existingListing) {
        await supabase
          .from("property_listings")
          .update({
            price: card.price,
            price_text: card.priceText,
            is_reduced: card.isReduced,
            last_seen: now,
            status: "active",
          })
          .eq("id", (existingListing as { id: string }).id)
      } else {
        await supabase.from("property_listings").insert({
          property_id: propertyId,
          raw_id: rawId,
          source,
          source_url: card.listingUrl,
          listing_id: card.listingId,
          price: card.price,
          price_text: card.priceText,
          is_reduced: card.isReduced,
          listed_at: card.listedAt,
          first_seen: now,
          last_seen: now,
          status: "active",
        })
      }

      summary.listings.push({
        propertyId,
        propertyKey: key,
        listingUrl: card.listingUrl,
        listingId: card.listingId,
        address: card.displayAddress,
        postcode: card.postcode,
        district: card.district,
        price: card.price,
        bedrooms: card.bedrooms,
        bathrooms: card.bathrooms,
        propertyType: card.propertyType,
        thumbnailUrl: card.thumbnailUrl,
        description: card.description,
        latitude: lat,
        longitude: lng,
      })
    } catch (err) {
      console.warn("[ingest] canonical upsert failed:", err instanceof Error ? err.message : err)
    }
  }

  // Mark the raw batch processed so replays are explicit.
  await supabase
    .from("discovery_raw_listings")
    .update({ processed: true, processed_at: now })
    .eq("run_id", runId)

  return summary
}

/**
 * Mark listings we did NOT see in this run as delisted — the staleness half of
 * the contract. Scoped to a district so one area's run can't retire another's.
 */
export async function markUnseenAsDelisted(opts: {
  supabase: Supa
  district: string
  seenUrls: string[]
  /** Only retire rows last seen before this cutoff (defaults to now). */
  before?: string
}): Promise<number> {
  const { supabase, district, seenUrls } = opts
  const cutoff = opts.before ?? new Date().toISOString()
  try {
    const { data: props } = await supabase
      .from("properties")
      .select("id")
      .eq("postcode_district", district)
      .eq("status", "active")
    const ids = ((props as Array<{ id: string }>) ?? []).map((p) => p.id)
    if (ids.length === 0) return 0

    let q = supabase
      .from("property_listings")
      .update({ status: "delisted" })
      .in("property_id", ids)
      .eq("status", "active")
      .lt("last_seen", cutoff)
    if (seenUrls.length > 0) {
      q = q.not("source_url", "in", `(${seenUrls.map((u) => `"${u}"`).join(",")})`)
    }
    const { data } = await q.select("id")
    return ((data as unknown[]) ?? []).length
  } catch (err) {
    console.warn("[ingest] delist sweep failed:", err instanceof Error ? err.message : err)
    return 0
  }
}
