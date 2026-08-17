/**
 * Sold-comparable ingestion — feeds the comps engine (layer 4).
 *
 * Sold transactions travel the same raw → normalise → canonical path as active
 * listings, so a comp that produces a suspicious valuation can be traced back
 * to the exact payload it came from.
 *
 *   L1  discovery_raw_listings  raw sold payload, source='rightmove_sold'
 *   L2  validation              a comp needs an address, a positive price AND a
 *                               usable sold date — without the date it cannot
 *                               be weighted for recency, so it is quarantined
 *   L3  properties              same canonical entity as the active listing, so
 *                               a house we're screening and the same house's
 *                               past sale resolve to ONE property
 *       property_sales          the transaction itself
 *
 * Deterministic and side-effect explicit — no scoring, no LLM.
 */
import {
  normaliseAddress,
  normalisePostcode,
  propertyKey,
  geocodePostcode,
  type Supa,
  type RawCard,
} from "@/lib/discovery/ingest"
import { toDistrict } from "@/lib/discovery/areaIntel"

export interface SoldIngestSummary {
  runId: string
  rawWritten: number
  quarantined: number
  propertiesUpserted: number
  salesRecorded: number
  /** Sales already on file — re-scraping is idempotent, not additive. */
  duplicatesSkipped: number
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

/**
 * Rightmove renders sold dates as "12 Mar 2025", ISO, or occasionally just a
 * month and year. Returns YYYY-MM-DD, or null when nothing usable is present.
 */
export function parseSoldDate(raw: unknown): string | null {
  const s = str(raw)
  if (!s) return null

  // Already ISO-ish
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  // Require an explicit 4-digit year before trusting Date parsing. Without
  // this, JS happily turns "3" into 2001-03-01 — a garbage value that would
  // enter the comp set as a real-looking sale and quietly distort valuations.
  if (!/\b(19|20)\d{2}\b/.test(s)) return null

  const parsed = new Date(s)
  if (Number.isFinite(parsed.getTime())) {
    const year = parsed.getUTCFullYear()
    if (year >= 1990 && year <= new Date().getUTCFullYear() + 1) {
      return parsed.toISOString().slice(0, 10)
    }
  }
  return null
}

export interface NormalisedSale {
  displayAddress: string
  canonicalAddress: string
  postcode: string
  district: string
  soldPrice: number
  soldDate: string
  bedrooms: number | null
  propertyType: string | null
  tenure: string | null
  floorAreaSqft: number | null
  sourceUrl: string | null
}

export type SoldNormaliseOutcome =
  | { ok: true; sale: NormalisedSale }
  | { ok: false; missingFields: string[]; reason: string }

/** Map a sold card onto the unified sale schema, or explain why it can't be. */
export function normaliseSoldCard(raw: RawCard, fallbackArea?: string): SoldNormaliseOutcome {
  const displayAddress = str(raw.address) ?? ""
  const soldPrice = num(raw.price)
  const soldDate = parseSoldDate(raw.dateSold)

  const missing: string[] = []
  if (!displayAddress) missing.push("address")
  if (soldPrice === null || soldPrice <= 0) missing.push("price")
  // Recency weighting is core to comp selection — a sale without a date is
  // worse than no comp at all, because it would silently distort the median.
  if (!soldDate) missing.push("dateSold")

  if (missing.length > 0) {
    return {
      ok: false,
      missingFields: missing,
      reason: `mandatory field(s) missing: ${missing.join(", ")}`,
    }
  }

  const postcode =
    normalisePostcode(str(raw.postcode)) ||
    normalisePostcode(displayAddress) ||
    normalisePostcode(fallbackArea) ||
    (fallbackArea ?? "").toUpperCase()

  // Prefer an explicit sqft, else convert from m².
  const sqft = num(raw.floorSizeSqft) ?? (num(raw.floorSizeM2) ? num(raw.floorSizeM2)! * 10.7639 : null)

  return {
    ok: true,
    sale: {
      displayAddress,
      canonicalAddress: normaliseAddress(displayAddress),
      postcode,
      district: toDistrict(postcode || fallbackArea || ""),
      soldPrice: soldPrice!,
      soldDate: soldDate!,
      bedrooms: num(raw.bedrooms),
      propertyType: str(raw.propertyType),
      tenure: str(raw.tenure),
      floorAreaSqft: sqft != null ? Math.round(sqft) : null,
      sourceUrl: str(raw.listingUrl),
    },
  }
}

/**
 * Land sold comps through L1→L3 so the comps engine has something to select
 * from. Idempotent: re-running the same scrape records no new sales.
 */
export async function ingestSoldComps(opts: {
  supabase: Supa
  runId: string
  cards: RawCard[]
  fallbackArea?: string
  source?: string
  /** Sold records come from a dedicated page, so they're more complete. */
  confidence?: number
  geocode?: boolean
}): Promise<SoldIngestSummary> {
  const {
    supabase,
    runId,
    cards,
    fallbackArea,
    source = "rightmove_sold",
    confidence = 0.85,
  } = opts
  const shouldGeocode = opts.geocode !== false

  const summary: SoldIngestSummary = {
    runId,
    rawWritten: 0,
    quarantined: 0,
    propertiesUpserted: 0,
    salesRecorded: 0,
    duplicatesSkipped: 0,
  }
  if (cards.length === 0) return summary

  // ── L1 ──────────────────────────────────────────────────────────────────
  const { data: inserted, error: rawErr } = await supabase
    .from("discovery_raw_listings")
    .insert(
      cards.map((payload) => ({
        run_id: runId,
        source,
        source_url: str(payload.listingUrl) ?? null,
        scraped_at: new Date().toISOString(),
        confidence,
        payload,
      })),
    )
    .select("id, payload")

  if (rawErr) throw new Error(`sold raw landing write failed: ${rawErr.message}`)

  const rawRecords = (inserted ?? []) as Array<{ id: string; payload: RawCard }>
  summary.rawWritten = rawRecords.length

  // ── L2 ──────────────────────────────────────────────────────────────────
  const good: Array<{ rawId: string; sale: NormalisedSale }> = []
  const bad: Array<Record<string, unknown>> = []

  for (const rec of rawRecords) {
    const outcome = normaliseSoldCard(rec.payload, fallbackArea)
    if (outcome.ok) good.push({ rawId: rec.id, sale: outcome.sale })
    else {
      bad.push({
        run_id: runId,
        raw_id: rec.id,
        source,
        source_url: str(rec.payload.listingUrl) ?? null,
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

  // ── L3 ──────────────────────────────────────────────────────────────────
  const now = new Date().toISOString()

  for (const { rawId, sale } of good) {
    try {
      const key = propertyKey(sale.displayAddress, sale.postcode)

      const { data: existing } = await supabase
        .from("properties")
        .select("id, latitude")
        .eq("property_key", key)
        .maybeSingle()

      let propertyId: string
      if (existing) {
        const row = existing as { id: string; latitude: number | null }
        propertyId = row.id
        // Do NOT force status to 'sold' — the same property may be actively
        // listed again, and the active listing is the more useful state.
        await supabase
          .from("properties")
          .update({ last_seen: now, updated_at: now })
          .eq("id", propertyId)
      } else {
        let lat: number | null = null
        let lng: number | null = null
        if (shouldGeocode) {
          const geo = await geocodePostcode(sale.postcode || sale.district)
          if (geo) {
            lat = geo.lat
            lng = geo.lng
          }
        }

        const { data: created, error: insErr } = await supabase
          .from("properties")
          .insert({
            property_key: key,
            canonical_address: sale.canonicalAddress || sale.displayAddress,
            postcode: sale.postcode || null,
            postcode_district: sale.district || null,
            latitude: lat,
            longitude: lng,
            property_type: sale.propertyType,
            bedrooms: sale.bedrooms,
            tenure: sale.tenure,
            first_seen: now,
            last_seen: now,
            status: "sold",
          })
          .select("id")
          .single()
        if (insErr || !created) {
          console.warn("[ingestSold] property insert failed:", insErr?.message)
          continue
        }
        propertyId = (created as { id: string }).id
      }
      summary.propertiesUpserted++

      // Idempotent on (property, date, price) — the same transaction scraped
      // twice must not become two comps.
      const { data: dupe } = await supabase
        .from("property_sales")
        .select("id")
        .eq("property_id", propertyId)
        .eq("sold_date", sale.soldDate)
        .eq("sold_price", sale.soldPrice)
        .maybeSingle()

      if (dupe) {
        summary.duplicatesSkipped++
        continue
      }

      const { error: saleErr } = await supabase.from("property_sales").insert({
        property_id: propertyId,
        raw_id: rawId,
        sold_price: sale.soldPrice,
        sold_date: sale.soldDate,
        bedrooms: sale.bedrooms,
        property_type: sale.propertyType,
        tenure: sale.tenure,
        floor_area_sqft: sale.floorAreaSqft,
        source,
        source_url: sale.sourceUrl,
      })
      if (saleErr) {
        console.warn("[ingestSold] sale insert failed:", saleErr.message)
        continue
      }
      summary.salesRecorded++
    } catch (err) {
      console.warn("[ingestSold] upsert failed:", err instanceof Error ? err.message : err)
    }
  }

  await supabase
    .from("discovery_raw_listings")
    .update({ processed: true, processed_at: now })
    .eq("run_id", runId)

  return summary
}
