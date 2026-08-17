/**
 * BMV / BRR deal finder — the end-to-end run, layers 1→6 in one call.
 *
 *   1. scrape SOLD comps for the district and land them (populates the store
 *      the comps engine selects from)
 *   2. scrape ACTIVE listings and land them the same way
 *   3. value every active listing against its own nearest comps
 *   4. keep only genuine below-market candidates
 *   5. rank and return the single best one
 *
 * "Genuine" is deliberately strict — see BMV_CRITERIA. The point of this
 * function is to return ONE deal you can act on, not a long list of maybes, so
 * it would rather return nothing than something weak. Every rejection is
 * recorded in `rejected` so a null result is explainable.
 *
 * Deterministic end to end: the ranking is arithmetic over comps, not a model's
 * opinion.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { scrapeRightmoveSearch } from "@/lib/scrapers/rightmove-search-scraper"
import { scrapeRightmoveSold } from "@/lib/scrapers/rightmove-sold-scraper"
import { ingestListings, type CanonicalListing } from "@/lib/discovery/ingest"
import { ingestSoldComps } from "@/lib/discovery/ingestSold"
import { valueProperty, type CompsValuation } from "@/lib/discovery/comps"
import { randomUUID } from "crypto"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** What makes a candidate worth surfacing at all. */
export const BMV_CRITERIA = {
  /** Asking must be at least this far below comparable value. */
  minDiscountPct: 10,
  /** Only trust a discount computed from a solid comp set. */
  requiredConfidence: "high" as const,
  /** Below this many comps we don't believe the ARV regardless of spread. */
  minComps: 5,
}

export interface BmvCandidate {
  listing: CanonicalListing
  valuation: CompsValuation
  /** Cash left in after a 75% refinance at ARV — the BRR question. */
  estimatedEquityGain: number
  discountPct: number
}

export interface BmvFinderResult {
  district: string
  runId: string
  soldCompsIngested: number
  activeListingsScanned: number
  valued: number
  candidates: BmvCandidate[]
  best: BmvCandidate | null
  /** Why each near-miss was rejected — makes a null `best` explainable. */
  rejected: string[]
  notes: string[]
}

export interface BmvFinderOptions {
  maxListings?: number
  maxSoldComps?: number
  minPrice?: number
  maxPrice?: number
  minBedrooms?: number
  maxBedrooms?: number
  /** Months of sold history to pull for comps. */
  soldMonths?: number
}

/**
 * Hunt one district for the strongest below-market candidate.
 *
 * Requires live scraper credentials (BrightData) and a service-role Supabase
 * client, so this only runs where those exist — a server route or a scheduled
 * agent, not a local dev box without secrets.
 */
export async function findBestBmvDeal(
  district: string,
  opts: BmvFinderOptions = {},
): Promise<BmvFinderResult> {
  const supabase = createAdminClient()
  const runId = randomUUID()
  const notes: string[] = []
  const rejected: string[] = []

  const result: BmvFinderResult = {
    district: district.toUpperCase(),
    runId,
    soldCompsIngested: 0,
    activeListingsScanned: 0,
    valued: 0,
    candidates: [],
    best: null,
    rejected,
    notes,
  }

  // ── 1. Sold comps first — without these nothing can be valued ───────────
  try {
    const sold = await scrapeRightmoveSold({
      postcode: district,
      maxResults: opts.maxSoldComps ?? 60,
      soldInMonths: opts.soldMonths ?? 24,
      minBedrooms: opts.minBedrooms,
      maxBedrooms: opts.maxBedrooms,
    })
    const ingested = await ingestSoldComps({
      supabase,
      runId,
      cards: sold as unknown as Record<string, unknown>[],
      fallbackArea: district,
    })
    result.soldCompsIngested = ingested.salesRecorded
    notes.push(
      `${sold.length} sold records scraped → ${ingested.salesRecorded} new comps ` +
        `(${ingested.duplicatesSkipped} already known, ${ingested.quarantined} quarantined)`,
    )
  } catch (err) {
    notes.push(`Sold comp scrape failed: ${err instanceof Error ? err.message : err}`)
  }

  await sleep(3000) // polite gap between scrapes

  // ── 2. Active listings ──────────────────────────────────────────────────
  let active: CanonicalListing[] = []
  try {
    const rows = await scrapeRightmoveSearch({
      postcode: district,
      minPrice: opts.minPrice,
      maxPrice: opts.maxPrice,
      minBedrooms: opts.minBedrooms,
      maxBedrooms: opts.maxBedrooms,
      maxResults: opts.maxListings ?? 25,
      sortType: "newest",
    })
    const ingested = await ingestListings({
      supabase,
      runId,
      source: "rightmove_search",
      cards: rows as unknown as Record<string, unknown>[],
      fallbackArea: district,
    })
    active = ingested.listings
    result.activeListingsScanned = active.length
    notes.push(`${rows.length} active listings scraped → ${active.length} canonical`)
  } catch (err) {
    notes.push(`Active listing scrape failed: ${err instanceof Error ? err.message : err}`)
  }

  if (active.length === 0) {
    notes.push("No active listings to value — nothing to rank")
    return result
  }

  // ── 3-4. Value each listing against its own comps, then filter ──────────
  for (const listing of active) {
    if (listing.latitude == null || listing.longitude == null) {
      rejected.push(`${listing.address}: no coordinates, cannot select comps`)
      continue
    }

    const valuation = await valueProperty(
      supabase,
      {
        latitude: listing.latitude,
        longitude: listing.longitude,
        bedrooms: listing.bedrooms,
        propertyType: listing.propertyType,
        askingPrice: listing.price,
      },
      { months: opts.soldMonths ?? 24 },
    )
    result.valued++

    if (valuation.arv == null) {
      rejected.push(`${listing.address}: no ARV (${valuation.compCount} comps)`)
      continue
    }
    if (valuation.compCount < BMV_CRITERIA.minComps) {
      rejected.push(
        `${listing.address}: only ${valuation.compCount} comps (need ${BMV_CRITERIA.minComps})`,
      )
      continue
    }
    if (valuation.confidence !== BMV_CRITERIA.requiredConfidence) {
      rejected.push(
        `${listing.address}: comp confidence ${valuation.confidence}, not ${BMV_CRITERIA.requiredConfidence}`,
      )
      continue
    }
    const discount = valuation.discountToArvPct ?? 0
    if (discount < BMV_CRITERIA.minDiscountPct) {
      rejected.push(`${listing.address}: only ${discount.toFixed(1)}% below ARV`)
      continue
    }

    // Cash left in after a standard 75% LTV refinance at ARV — the number
    // that decides whether a BRR actually recycles the deposit.
    const estimatedEquityGain = Math.round(valuation.arv * 0.75 - listing.price)

    result.candidates.push({ listing, valuation, discountPct: discount, estimatedEquityGain })
  }

  // ── 5. Rank: biggest genuine discount first ─────────────────────────────
  result.candidates.sort((a, b) => b.discountPct - a.discountPct)
  result.best = result.candidates[0] ?? null

  if (!result.best) {
    notes.push(
      `No listing met the bar (≥${BMV_CRITERIA.minDiscountPct}% below ARV, ` +
        `${BMV_CRITERIA.requiredConfidence} confidence, ≥${BMV_CRITERIA.minComps} comps). ` +
        `That is a real answer, not a failure — most listings are priced at market.`,
    )
  }

  return result
}
