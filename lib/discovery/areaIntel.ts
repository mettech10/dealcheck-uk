/**
 * District-level area intelligence for the discovery Tier 1 screen.
 *
 * CRITICAL DESIGN RULE: Tier 1 must never make a live call *per listing*.
 * So all lookups here are keyed by postcode DISTRICT and memoised for the
 * duration of a search run — one resolve per district, then every listing in
 * that district screens purely against the in-memory snapshot.
 *
 * Data sources, in priority order per field:
 *   1. area_intelligence      — our own aggregated deal data (22 districts,
 *                               yields sparse) — most trustworthy when present
 *   2. postcode_benchmarks    — 2.4k rows / 369 districts; median_monthly_rent
 *                               is fully populated, median_sold_price is not
 *   3. PropertyData (cached)  — fills the gaps. Already Supabase-cached for
 *                               7 days by lib/propertydata-cache, so this is
 *                               a cache read on all but the first district
 *                               lookup in a week (a "warm", not a per-listing
 *                               live call).
 *
 * Every field is nullable. A metric with no real backing stays null and the
 * dependent signal is simply not raised — we never substitute a national
 * average and present it as area data.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import {
  cachedGetSoldPrices,
  cachedGetRents,
  cachedGetHmoRents,
} from "@/lib/propertydata-cache"
import { weeklyToMonthly } from "@/lib/propertydata"
import { checkArticle4, type Article4CheckResult } from "@/lib/article4-service"

export interface DistrictIntel {
  district: string
  /** Typical sale price for the district (£). */
  medianSoldPrice: number | null
  /** Typical single-let monthly rent (£). */
  medianMonthlyRent: number | null
  /** Typical HMO room rent (£/room/month). */
  medianRoomRent: number | null
  /** Area median BTL gross yield (%) from our own deal data. */
  medianBtlGrossYield: number | null
  /** Area median HMO gross yield (%) from our own deal data. */
  medianHmoGrossYield: number | null
  /** Typical SA monthly revenue (£) from our own deal data. */
  medianSaMonthlyRevenue: number | null
  dominantStrategy: string | null
  /** 'high' | 'medium' | 'low' — how much deal data backs this district. */
  confidenceLevel: string
  article4: Article4CheckResult | null
  /** Which sources actually contributed — surfaced in the UI for honesty. */
  sources: string[]
}

const cache = new Map<string, Promise<DistrictIntel>>()

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Normalise "M14 5AA" / "m14" → "M14". */
export function toDistrict(postcode: string): string {
  return (postcode || "").trim().toUpperCase().split(/\s+/)[0]
}

/**
 * Resolve (and memoise) intelligence for one district. Safe to call once per
 * listing — repeat calls hit the in-process map, so no extra queries.
 */
export function getDistrictIntel(postcodeOrDistrict: string): Promise<DistrictIntel> {
  const district = toDistrict(postcodeOrDistrict)
  const hit = cache.get(district)
  if (hit) return hit
  const p = resolve(district)
  cache.set(district, p)
  return p
}

/** Clear the memo — call between search runs so data can't go stale. */
export function resetDistrictIntelCache(): void {
  cache.clear()
}

async function resolve(district: string): Promise<DistrictIntel> {
  const out: DistrictIntel = {
    district,
    medianSoldPrice: null,
    medianMonthlyRent: null,
    medianRoomRent: null,
    medianBtlGrossYield: null,
    medianHmoGrossYield: null,
    medianSaMonthlyRevenue: null,
    dominantStrategy: null,
    confidenceLevel: "low",
    article4: null,
    sources: [],
  }
  if (!district) return out

  const admin = (() => {
    try {
      return createAdminClient()
    } catch {
      return null
    }
  })()

  // ── 1. Our own aggregated deal intelligence ───────────────────────────
  if (admin) {
    try {
      const { data } = await admin
        .from("area_intelligence")
        .select(
          "median_purchase_price, median_btl_gross_yield, median_hmo_gross_yield," +
            " median_sa_monthly_revenue, dominant_strategy, confidence_level",
        )
        .eq("postcode_district", district)
        .maybeSingle()
      if (data) {
        const r = data as unknown as Record<string, unknown>
        out.medianSoldPrice = num(r.median_purchase_price)
        out.medianBtlGrossYield = num(r.median_btl_gross_yield)
        out.medianHmoGrossYield = num(r.median_hmo_gross_yield)
        out.medianSaMonthlyRevenue = num(r.median_sa_monthly_revenue)
        out.dominantStrategy = (r.dominant_strategy as string) ?? null
        out.confidenceLevel = (r.confidence_level as string) ?? "low"
        out.sources.push("area_intelligence")
      }
    } catch (err) {
      console.warn("[discovery/areaIntel] area_intelligence failed:", err)
    }

    // ── 2. Postcode benchmarks — best rent coverage ────────────────────
    try {
      const { data } = await admin
        .from("postcode_benchmarks")
        .select("median_monthly_rent, median_sold_price, gross_yield_median")
        .eq("postcode_district", district)
        .order("transaction_count_12m", { ascending: false, nullsFirst: false })
        .limit(1)
      const row = (data ?? [])[0] as Record<string, unknown> | undefined
      if (row) {
        out.medianMonthlyRent ??= num(row.median_monthly_rent)
        out.medianSoldPrice ??= num(row.median_sold_price)
        out.medianBtlGrossYield ??= num(row.gross_yield_median)
        out.sources.push("postcode_benchmarks")
      }
    } catch (err) {
      console.warn("[discovery/areaIntel] postcode_benchmarks failed:", err)
    }
  }

  // ── 3. PropertyData — fill remaining gaps (7-day Supabase cached) ─────
  // These are per-DISTRICT warms, not per-listing calls, and are cache hits
  // for the rest of the week once populated.
  if (!out.medianSoldPrice) {
    try {
      const sold = await cachedGetSoldPrices(district)
      const avg = num(sold?.data?.average)
      if (avg) {
        out.medianSoldPrice = avg
        out.sources.push("propertydata:sold-prices")
      }
    } catch (err) {
      console.warn("[discovery/areaIntel] sold-prices failed:", err)
    }
  }

  if (!out.medianMonthlyRent) {
    try {
      const rents = await cachedGetRents(district)
      const ll = rents?.data?.long_let
      const avg = num(ll?.average)
      if (avg) {
        // PropertyData long-let averages are weekly.
        out.medianMonthlyRent =
          (ll?.unit ?? "").toLowerCase().includes("week") ? weeklyToMonthly(avg) : avg
        out.sources.push("propertydata:rents")
      }
    } catch (err) {
      console.warn("[discovery/areaIntel] rents failed:", err)
    }
  }

  if (!out.medianRoomRent) {
    try {
      const hmo = await cachedGetHmoRents(district)
      const d = (hmo?.data ?? {}) as Record<string, { average?: number } | undefined>
      const roomAverages = [
        "double-ensuite",
        "double-shared-bath",
        "single-ensuite",
        "single-shared-bath",
      ]
        .map((k) => num(d[k]?.average))
        .filter((n): n is number => n !== null)
      if (roomAverages.length) {
        out.medianRoomRent = Math.round(
          roomAverages.reduce((a, b) => a + b, 0) / roomAverages.length,
        )
        out.sources.push("propertydata:rents-hmo")
      }
    } catch (err) {
      console.warn("[discovery/areaIntel] hmo-rents failed:", err)
    }
  }

  // ── Article 4 — reuse the existing engine, district-level ─────────────
  // NOTE: with only a district (no full postcode) the national point-in-
  // polygon lookup can't geocode, so this resolves from the curated table
  // and otherwise reports "unknown" — which we surface as-is. We never
  // downgrade an unknown to "none".
  if (admin) {
    try {
      out.article4 = await checkArticle4(admin, district)
    } catch (err) {
      console.warn("[discovery/areaIntel] article4 failed:", err)
    }
  }

  return out
}
