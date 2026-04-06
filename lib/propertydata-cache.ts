/**
 * PropertyData Cache Layer
 *
 * Wraps PropertyData API calls with a Supabase-backed cache.
 * Cache TTL: 24 hours for most endpoints, 7 days for sold prices.
 *
 * Usage: import cachedPropertyData instead of raw propertydata functions.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import {
  getHmoRents,
  getRents,
  getSoldPrices,
  getAskingPrices,
  weeklyToMonthly,
  type HmoRentsResponse,
  type RentsResponse,
  type SoldPricesResponse,
  type PricesResponse,
} from "@/lib/propertydata"

// ── Cache TTLs (hours) ────────────────────────────────────────────────────

const TTL = {
  "sold-prices": 168,  // 7 days — Land Registry data changes slowly
  "prices": 48,        // 2 days — asking prices change more often
  "rents": 24,         // 1 day — rental market is dynamic
  "rents-hmo": 24,     // 1 day
} as const

type CacheEndpoint = keyof typeof TTL

// ── Hash function ─────────────────────────────────────────────────────────

async function hashParams(params: Record<string, string | number | undefined>): Promise<string> {
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&")

  // Use Web Crypto API (available in Edge Runtime / Node 18+)
  const encoder = new TextEncoder()
  const data = encoder.encode(sorted)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

// ── Core cache logic ──────────────────────────────────────────────────────

interface CacheEntry {
  response: unknown
  fetched_at: string
}

async function getCached(paramsHash: string, endpoint: CacheEndpoint): Promise<CacheEntry | null> {
  try {
    const supabase = createAdminClient()
    const ttlHours = TTL[endpoint]
    const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from("propertydata_cache")
      .select("response, fetched_at")
      .eq("params_hash", paramsHash)
      .gte("fetched_at", cutoff)
      .single()

    if (error || !data) return null
    return data as CacheEntry
  } catch {
    return null
  }
}

async function setCache(
  postcode: string,
  endpoint: CacheEndpoint,
  bedrooms: number | undefined,
  paramsHash: string,
  response: unknown,
  extracted: { avg_price?: number; avg_rent?: number; radius_km?: number; points_count?: number }
): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.from("propertydata_cache").upsert(
      {
        postcode: postcode.toUpperCase().trim(),
        endpoint,
        bedrooms: bedrooms ?? null,
        params_hash: paramsHash,
        response,
        avg_price: extracted.avg_price ?? null,
        avg_rent: extracted.avg_rent ?? null,
        radius_km: extracted.radius_km ?? null,
        points_count: extracted.points_count ?? null,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "params_hash" }
    )
  } catch (err) {
    console.warn("[PD-Cache] Failed to write cache:", err)
  }
}

// ── Cached API wrappers ───────────────────────────────────────────────────

export async function cachedGetSoldPrices(
  postcode: string,
  bedrooms?: number
): Promise<SoldPricesResponse | null> {
  const params = { endpoint: "sold-prices", postcode: postcode.toUpperCase(), bedrooms }
  const hash = await hashParams(params as Record<string, string | number | undefined>)

  // Check cache
  const cached = await getCached(hash, "sold-prices")
  if (cached) {
    console.log("[PD-Cache] HIT sold-prices for", postcode)
    return cached.response as SoldPricesResponse
  }

  // Fetch fresh
  console.log("[PD-Cache] MISS sold-prices for", postcode)
  const result = await getSoldPrices(postcode, bedrooms)
  if (result && result.status === "success") {
    await setCache(postcode, "sold-prices", bedrooms, hash, result, {
      avg_price: result.data?.average,
      radius_km: result.data?.radius ? parseFloat(result.data.radius) : undefined,
      points_count: result.data?.points_analysed,
    })
  }
  return result
}

export async function cachedGetRents(
  postcode: string,
  bedrooms?: number,
  type?: string
): Promise<RentsResponse | null> {
  const params = { endpoint: "rents", postcode: postcode.toUpperCase(), bedrooms, type }
  const hash = await hashParams(params as Record<string, string | number | undefined>)

  const cached = await getCached(hash, "rents")
  if (cached) {
    console.log("[PD-Cache] HIT rents for", postcode)
    return cached.response as RentsResponse
  }

  console.log("[PD-Cache] MISS rents for", postcode)
  const result = await getRents(postcode, bedrooms, type)
  if (result && result.status === "success" && result.data?.long_let) {
    const ll = result.data.long_let
    await setCache(postcode, "rents", bedrooms, hash, result, {
      avg_rent: weeklyToMonthly(ll.average),
      radius_km: ll.radius ? parseFloat(ll.radius) : undefined,
      points_count: ll.points_analysed,
    })
  }
  return result
}

export async function cachedGetHmoRents(
  postcode: string,
  points: number = 20
): Promise<HmoRentsResponse | null> {
  const params = { endpoint: "rents-hmo", postcode: postcode.toUpperCase(), points }
  const hash = await hashParams(params as Record<string, string | number | undefined>)

  const cached = await getCached(hash, "rents-hmo")
  if (cached) {
    console.log("[PD-Cache] HIT rents-hmo for", postcode)
    return cached.response as HmoRentsResponse
  }

  console.log("[PD-Cache] MISS rents-hmo for", postcode)
  const result = await getHmoRents(postcode, points)
  if (result && result.status === "success") {
    // Calculate average across all room types
    const roomTypes = ["double-ensuite", "double-shared-bath", "single-ensuite", "single-shared-bath"] as const
    const rents: number[] = []
    for (const rt of roomTypes) {
      const room = result.data[rt]
      if (room?.average) rents.push(weeklyToMonthly(room.average))
    }
    const avgRent = rents.length > 0 ? Math.round(rents.reduce((a, b) => a + b, 0) / rents.length) : undefined

    await setCache(postcode, "rents-hmo", undefined, hash, result, {
      avg_rent: avgRent,
    })
  }
  return result
}

export async function cachedGetAskingPrices(
  postcode: string,
  bedrooms?: number
): Promise<PricesResponse | null> {
  const params = { endpoint: "prices", postcode: postcode.toUpperCase(), bedrooms }
  const hash = await hashParams(params as Record<string, string | number | undefined>)

  const cached = await getCached(hash, "prices")
  if (cached) {
    console.log("[PD-Cache] HIT prices for", postcode)
    return cached.response as PricesResponse
  }

  console.log("[PD-Cache] MISS prices for", postcode)
  const result = await getAskingPrices(postcode, bedrooms)
  if (result && result.status === "success") {
    await setCache(postcode, "prices", bedrooms, hash, result, {
      avg_price: result.data?.average,
      radius_km: result.data?.radius ? parseFloat(result.data.radius) : undefined,
      points_count: result.data?.points_analysed,
    })
  }
  return result
}
