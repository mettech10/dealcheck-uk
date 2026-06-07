import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Market Data Stats — /api/stats/market-data
 *
 * Returns aggregated market data from the PropertyData cache.
 * Query params:
 *   ?postcode=M1+1AA  — specific postcode stats
 *   (none)            — global aggregate stats
 */
export async function GET(req: Request) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(req.url)
    const postcode = searchParams.get("postcode")?.toUpperCase().trim()

    if (postcode) {
      // ── Per-postcode stats ──────────────────────────────────────────────
      const { data: entries, error } = await supabase
        .from("propertydata_cache")
        .select("endpoint, avg_price, avg_rent, radius_km, points_count, fetched_at")
        .eq("postcode", postcode)
        .order("fetched_at", { ascending: false })

      if (error) {
        console.error("[MARKET-DATA] Query error:", error)
        return NextResponse.json({ success: false, message: "Database error" }, { status: 500 })
      }

      if (!entries || entries.length === 0) {
        return NextResponse.json({
          success: true,
          postcode,
          cached: false,
          message: "No cached data for this postcode. Run an analysis first.",
        })
      }

      // Build summary from latest entry per endpoint
      const byEndpoint: Record<string, typeof entries[0]> = {}
      for (const entry of entries) {
        if (!byEndpoint[entry.endpoint]) {
          byEndpoint[entry.endpoint] = entry
        }
      }

      return NextResponse.json({
        success: true,
        postcode,
        cached: true,
        data: {
          soldPrices: byEndpoint["sold-prices"]
            ? {
                avgPrice: byEndpoint["sold-prices"].avg_price,
                radiusKm: byEndpoint["sold-prices"].radius_km,
                points: byEndpoint["sold-prices"].points_count,
                lastFetched: byEndpoint["sold-prices"].fetched_at,
              }
            : null,
          rents: byEndpoint["rents"]
            ? {
                avgRent: byEndpoint["rents"].avg_rent,
                radiusKm: byEndpoint["rents"].radius_km,
                points: byEndpoint["rents"].points_count,
                lastFetched: byEndpoint["rents"].fetched_at,
              }
            : null,
          hmoRents: byEndpoint["rents-hmo"]
            ? {
                avgRent: byEndpoint["rents-hmo"].avg_rent,
                lastFetched: byEndpoint["rents-hmo"].fetched_at,
              }
            : null,
          askingPrices: byEndpoint["prices"]
            ? {
                avgPrice: byEndpoint["prices"].avg_price,
                points: byEndpoint["prices"].points_count,
                lastFetched: byEndpoint["prices"].fetched_at,
              }
            : null,
        },
      })
    }

    // ── Global aggregate stats ──────────────────────────────────────────
    const { data: stats, error } = await supabase
      .from("propertydata_cache")
      .select("endpoint, postcode, fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(500)

    if (error) {
      return NextResponse.json({ success: false, message: "Database error" }, { status: 500 })
    }

    const uniquePostcodes = new Set(stats?.map((s) => s.postcode) || [])
    const endpointCounts: Record<string, number> = {}
    for (const entry of stats || []) {
      endpointCounts[entry.endpoint] = (endpointCounts[entry.endpoint] || 0) + 1
    }

    return NextResponse.json({
      success: true,
      data: {
        totalCachedResponses: stats?.length || 0,
        uniquePostcodes: uniquePostcodes.size,
        byEndpoint: endpointCounts,
        latestFetch: stats?.[0]?.fetched_at || null,
      },
    })
  } catch (error) {
    console.error("[MARKET-DATA] Error:", error)
    return NextResponse.json(
      { success: false, message: "Failed to fetch market data stats" },
      { status: 500 }
    )
  }
}
