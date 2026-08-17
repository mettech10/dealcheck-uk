/**
 * Comps & Valuation engine — layer 4 of the discovery pipeline.
 *
 * Given a subject property, pull the nearest eligible SOLD comparables from the
 * canonical store and derive a valuation from them.
 *
 * Deliberately deterministic: pure arithmetic over a comp set, no LLM, no
 * prompt. Every number it returns is reproducible from the same inputs, and the
 * `adjustments` / `excluded` arrays make it auditable — you can always see WHY
 * a figure came out where it did.
 *
 * Selection lives in SQL (find_sold_comps, PostGIS + GIST). Everything below
 * the fetch is unit-testable without a database.
 */
import type { createAdminClient } from "@/lib/supabase/admin"

type Supa = ReturnType<typeof createAdminClient>

// ── Types ──────────────────────────────────────────────────────────────────

export interface SubjectProperty {
  latitude: number
  longitude: number
  bedrooms?: number | null
  propertyType?: string | null
  floorAreaSqft?: number | null
  /** Asking/purchase price, used only to express a discount — never to value. */
  askingPrice?: number | null
}

export interface RawComp {
  saleId: string
  propertyId: string
  address: string
  postcode: string | null
  distanceM: number
  soldPrice: number
  soldDate: string
  bedrooms: number | null
  propertyType: string | null
  floorAreaSqft: number | null
  source: string
}

export interface WeightedComp extends RawComp {
  /** 0..1 — how comparable this sale is to the subject. */
  similarity: number
  /** Sale price after bedroom adjustment, i.e. "what this implies for subject". */
  adjustedPrice: number
  monthsAgo: number
}

export type Confidence = "high" | "medium" | "low" | "none"

export interface CompsValuation {
  /** After-repair / market value implied by the comp set. Null when unusable. */
  arv: number | null
  /** Central estimate of £/sqft across comps that reported a floor area. */
  pricePerSqft: number | null
  /** Plain median of raw sold prices — the unadjusted sanity check. */
  medianSoldPrice: number | null
  /** Interquartile range as a % of the median — how tight the comp set is. */
  dispersionPct: number | null
  confidence: Confidence
  compCount: number
  /** Discount of asking price vs ARV, positive = below comps (a good sign). */
  discountToArvPct: number | null
  comps: WeightedComp[]
  adjustments: string[]
  excluded: string[]
}

export interface FindCompsOptions {
  radiusM?: number
  months?: number
  limit?: number
  /** Bedroom tolerance either side of the subject. */
  bedroomTolerance?: number
}

const DEFAULTS = {
  radiusM: 1600, // ~1 mile
  months: 24,
  limit: 30,
  bedroomTolerance: 1,
}

/** Minimum comps before we're willing to publish an ARV at all. */
export const MIN_COMPS_FOR_VALUATION = 3

// ── Helpers ────────────────────────────────────────────────────────────────

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sorted[base + 1]
  return next !== undefined ? sorted[base] + rest * (next - sorted[base]) : sorted[base]
}

/** Weighted median — the weighted analogue of the middle value. */
export function weightedMedian(pairs: Array<{ value: number; weight: number }>): number | null {
  const valid = pairs.filter((p) => Number.isFinite(p.value) && p.weight > 0)
  if (valid.length === 0) return null
  const sorted = [...valid].sort((a, b) => a.value - b.value)
  const total = sorted.reduce((s, p) => s + p.weight, 0)
  let acc = 0
  for (const p of sorted) {
    acc += p.weight
    if (acc >= total / 2) return p.value
  }
  return sorted[sorted.length - 1].value
}

export function monthsBetween(from: string, to: Date = new Date()): number {
  const d = new Date(from)
  if (!Number.isFinite(d.getTime())) return 999
  return Math.max(0, (to.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
}

/** Coarse property-type family so "Semi-Detached House" matches "semi-detached". */
export function typeFamily(t: string | null | undefined): string {
  const s = (t ?? "").toLowerCase()
  if (s.includes("detached") && !s.includes("semi")) return "detached"
  if (s.includes("semi")) return "semi"
  if (s.includes("terrac") || s.includes("end of terrace")) return "terraced"
  if (s.includes("flat") || s.includes("apartment") || s.includes("maisonette")) return "flat"
  if (s.includes("bungalow")) return "bungalow"
  return "other"
}

// ── Similarity ─────────────────────────────────────────────────────────────

/**
 * How comparable a sale is to the subject, 0..1. Three independent decays,
 * multiplied so a comp must be good on every axis to score highly:
 *   distance  — linear decay to the search radius
 *   recency   — linear decay over the lookback window
 *   likeness  — bedroom delta and property-type family
 */
export function similarityScore(
  comp: Pick<RawComp, "distanceM" | "bedrooms" | "propertyType"> & { monthsAgo: number },
  subject: Pick<SubjectProperty, "bedrooms" | "propertyType">,
  opts: { radiusM: number; months: number },
): number {
  const distanceScore = Math.max(0, 1 - comp.distanceM / Math.max(1, opts.radiusM))
  const recencyScore = Math.max(0, 1 - comp.monthsAgo / Math.max(1, opts.months))

  let likeness = 1
  if (subject.bedrooms != null && comp.bedrooms != null) {
    const delta = Math.abs(subject.bedrooms - comp.bedrooms)
    likeness *= delta === 0 ? 1 : delta === 1 ? 0.7 : 0.4
  } else {
    likeness *= 0.85 // unknown bedrooms — mild penalty, not disqualifying
  }
  if (subject.propertyType && comp.propertyType) {
    likeness *= typeFamily(subject.propertyType) === typeFamily(comp.propertyType) ? 1 : 0.6
  }

  // Floors keep a distant-but-otherwise-perfect comp from vanishing entirely.
  return Math.max(0.01, distanceScore * 0.4 + recencyScore * 0.25 + likeness * 0.35)
}

/**
 * Price gradient per bedroom, derived from the comp set itself rather than a
 * hardcoded assumption. Returns null when the comps don't span enough bedroom
 * counts to infer one honestly.
 */
export function bedroomGradient(comps: RawComp[]): number | null {
  const byBeds = new Map<number, number[]>()
  for (const c of comps) {
    if (c.bedrooms == null || c.soldPrice <= 0) continue
    const list = byBeds.get(c.bedrooms) ?? []
    list.push(c.soldPrice)
    byBeds.set(c.bedrooms, list)
  }
  const points = [...byBeds.entries()]
    .map(([beds, prices]) => ({ beds, price: median(prices)! }))
    .filter((p) => Number.isFinite(p.price))
    .sort((a, b) => a.beds - b.beds)

  if (points.length < 2) return null

  // Average successive per-bedroom deltas, ignoring non-monotonic noise.
  const deltas: number[] = []
  for (let i = 1; i < points.length; i++) {
    const dBeds = points[i].beds - points[i - 1].beds
    if (dBeds <= 0) continue
    deltas.push((points[i].price - points[i - 1].price) / dBeds)
  }
  const g = median(deltas)
  // A negative or absurd gradient means the sample is noise, not signal.
  if (g == null || g <= 0) return null
  return g
}

// ── Valuation ──────────────────────────────────────────────────────────────

/**
 * Turn a comp set into a valuation. Pure — same inputs, same output, always.
 */
export function valueFromComps(
  subject: SubjectProperty,
  raw: RawComp[],
  opts: FindCompsOptions = {},
): CompsValuation {
  const radiusM = opts.radiusM ?? DEFAULTS.radiusM
  const months = opts.months ?? DEFAULTS.months
  const adjustments: string[] = []
  const excluded: string[] = []

  const usable = raw.filter((c) => {
    if (!(c.soldPrice > 0)) {
      excluded.push(`${c.address}: no sold price`)
      return false
    }
    return true
  })

  if (usable.length === 0) {
    return {
      arv: null,
      pricePerSqft: null,
      medianSoldPrice: null,
      dispersionPct: null,
      confidence: "none",
      compCount: 0,
      discountToArvPct: null,
      comps: [],
      adjustments,
      excluded,
    }
  }

  const gradient = bedroomGradient(usable)
  if (gradient != null && subject.bedrooms != null) {
    adjustments.push(
      `Bedroom gradient of £${Math.round(gradient).toLocaleString()}/bed derived from the comp set`,
    )
  } else if (subject.bedrooms != null) {
    adjustments.push(
      "Comps did not span enough bedroom counts to infer a gradient — no bedroom adjustment applied",
    )
  }

  const weighted: WeightedComp[] = usable.map((c) => {
    const monthsAgo = monthsBetween(c.soldDate)
    const similarity = similarityScore({ ...c, monthsAgo }, subject, { radiusM, months })

    // Adjust the comp toward the subject's bedroom count where we can.
    let adjustedPrice = c.soldPrice
    if (gradient != null && subject.bedrooms != null && c.bedrooms != null) {
      adjustedPrice = c.soldPrice + (subject.bedrooms - c.bedrooms) * gradient
      if (adjustedPrice <= 0) adjustedPrice = c.soldPrice
    }

    return { ...c, similarity, adjustedPrice, monthsAgo }
  })

  // ARV — weighted median of adjusted prices. Median (not mean) so one odd
  // sale can't drag the valuation.
  const arvRaw = weightedMedian(
    weighted.map((c) => ({ value: c.adjustedPrice, weight: c.similarity })),
  )
  const medianSoldPrice = median(weighted.map((c) => c.soldPrice))

  // £/sqft from comps that reported a floor area.
  const ppsfValues = weighted
    .filter((c) => c.floorAreaSqft != null && c.floorAreaSqft > 0)
    .map((c) => c.soldPrice / (c.floorAreaSqft as number))
  const pricePerSqft = median(ppsfValues)
  if (ppsfValues.length === 0) {
    adjustments.push("No comp reported a floor area — £/sqft unavailable")
  }

  // Dispersion — IQR as a share of the median. Tight set = trustworthy.
  const sortedPrices = weighted.map((c) => c.adjustedPrice).sort((a, b) => a - b)
  const q1 = quantile(sortedPrices, 0.25)
  const q3 = quantile(sortedPrices, 0.75)
  const med = median(sortedPrices)
  const dispersionPct = med && med > 0 ? ((q3 - q1) / med) * 100 : null

  // Confidence: enough comps AND agreement between them.
  let confidence: Confidence = "none"
  if (weighted.length >= MIN_COMPS_FOR_VALUATION) {
    const tight = dispersionPct != null && dispersionPct <= 25
    const loose = dispersionPct != null && dispersionPct <= 45
    if (weighted.length >= 8 && tight) confidence = "high"
    else if (weighted.length >= 5 && loose) confidence = "medium"
    else confidence = "low"
  } else {
    confidence = "low"
    adjustments.push(
      `Only ${weighted.length} comp(s) — below the ${MIN_COMPS_FOR_VALUATION} needed for a reliable valuation`,
    )
  }

  // Below the minimum we refuse to publish an ARV rather than guess.
  const arv =
    weighted.length >= MIN_COMPS_FOR_VALUATION && arvRaw != null ? Math.round(arvRaw) : null

  const discountToArvPct =
    arv && subject.askingPrice && subject.askingPrice > 0
      ? ((arv - subject.askingPrice) / arv) * 100
      : null

  return {
    arv,
    pricePerSqft: pricePerSqft != null ? Math.round(pricePerSqft) : null,
    medianSoldPrice: medianSoldPrice != null ? Math.round(medianSoldPrice) : null,
    dispersionPct: dispersionPct != null ? Number(dispersionPct.toFixed(1)) : null,
    confidence,
    compCount: weighted.length,
    discountToArvPct: discountToArvPct != null ? Number(discountToArvPct.toFixed(1)) : null,
    comps: weighted.sort((a, b) => b.similarity - a.similarity),
    adjustments,
    excluded,
  }
}

// ── Selection (DB) ─────────────────────────────────────────────────────────

/** Fetch eligible sold comps around the subject via the PostGIS RPC. */
export async function findComps(
  supabase: Supa,
  subject: SubjectProperty,
  opts: FindCompsOptions = {},
): Promise<RawComp[]> {
  const radiusM = opts.radiusM ?? DEFAULTS.radiusM
  const months = opts.months ?? DEFAULTS.months
  const limit = opts.limit ?? DEFAULTS.limit
  const tol = opts.bedroomTolerance ?? DEFAULTS.bedroomTolerance

  const { data, error } = await supabase.rpc("find_sold_comps", {
    p_lat: subject.latitude,
    p_lng: subject.longitude,
    p_radius_m: radiusM,
    p_min_beds: subject.bedrooms != null ? Math.max(0, subject.bedrooms - tol) : null,
    p_max_beds: subject.bedrooms != null ? subject.bedrooms + tol : null,
    // Match on the family, not the raw label.
    p_property_type: subject.propertyType ? typeFamilyKeyword(subject.propertyType) : null,
    p_months: months,
    p_limit: limit,
  })

  if (error) {
    console.warn("[comps] find_sold_comps failed:", error.message)
    return []
  }

  return ((data as Array<Record<string, unknown>>) ?? []).map((r) => ({
    saleId: String(r.sale_id),
    propertyId: String(r.property_id),
    address: String(r.canonical_address ?? ""),
    postcode: (r.postcode as string) ?? null,
    distanceM: Number(r.distance_m ?? 0),
    soldPrice: Number(r.sold_price ?? 0),
    soldDate: String(r.sold_date ?? ""),
    bedrooms: r.bedrooms == null ? null : Number(r.bedrooms),
    propertyType: (r.property_type as string) ?? null,
    floorAreaSqft: r.floor_area_sqft == null ? null : Number(r.floor_area_sqft),
    source: String(r.source ?? ""),
  }))
}

/**
 * SQL matches with LIKE, so pass the family keyword rather than the full label
 * ("Semi-Detached House" → "semi").
 */
function typeFamilyKeyword(t: string): string | null {
  const fam = typeFamily(t)
  return fam === "other" ? null : fam === "terraced" ? "terrac" : fam
}

/**
 * Full layer-4 entry point: select comps, then value the subject from them.
 * Widens the radius once if the first pass is too thin, so a sparse area still
 * gets an answer (and says so in `adjustments`).
 */
export async function valueProperty(
  supabase: Supa,
  subject: SubjectProperty,
  opts: FindCompsOptions = {},
): Promise<CompsValuation> {
  let comps = await findComps(supabase, subject, opts)
  const usedOpts = { ...opts }

  if (comps.length < MIN_COMPS_FOR_VALUATION) {
    const widened = {
      ...opts,
      radiusM: (opts.radiusM ?? DEFAULTS.radiusM) * 2,
      months: Math.max(opts.months ?? DEFAULTS.months, 36),
    }
    const retry = await findComps(supabase, subject, widened)
    if (retry.length > comps.length) {
      comps = retry
      Object.assign(usedOpts, widened)
    }
  }

  const valuation = valueFromComps(subject, comps, usedOpts)
  if (usedOpts.radiusM && usedOpts.radiusM !== (opts.radiusM ?? DEFAULTS.radiusM)) {
    valuation.adjustments.push(
      `Search widened to ${(usedOpts.radiusM / 1000).toFixed(1)}km / ${usedOpts.months} months to find enough comps`,
    )
  }
  return valuation
}
