import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/apiAuth"
import {
  weeklyToMonthly,
  mapRoomType,
  type HmoRentsResponse,
} from "@/lib/propertydata"
import { cachedGetHmoRents, cachedFlaskSpareroom } from "@/lib/propertydata-cache"

const FLASK_URL = process.env.BACKEND_API_URL || "https://metusa-deal-analyzer.onrender.com"

/**
 * HMO Rental Comparables — /api/comparables/spareroom
 *
 * Primary: PropertyData /rents-hmo (structured room rents by type)
 * Fallback: Flask /api/comparables (SpareRoom/OpenRent/Rightmove actors)
 */
export async function POST(req: Request) {
  const sessionUser = await getSessionUser()
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { postcode, maxResults } = body

    if (!postcode) {
      return NextResponse.json(
        { success: false, message: "Postcode is required" },
        { status: 400 }
      )
    }

    console.log("[HMO-ROUTE] Fetching HMO rents - postcode:", postcode)

    // ── Primary: PropertyData API ──────────────────────────────────────────
    const pdData = await cachedGetHmoRents(postcode, 15)

    if (pdData && pdData.status === "success" && pdData.data) {
      const result = mapPropertyDataToHmoResponse(pdData, postcode)
      console.log("[HMO-ROUTE] PropertyData success -", result.count, "room types,", result.listings.length, "listings")
      return NextResponse.json(result)
    }

    console.log("[HMO-ROUTE] PropertyData failed or empty, falling back to Flask (cached)")

    // ── Fallback: Flask backend (SpareRoom/OpenRent actors) ────────────────
    // Wrapped in cachedFlaskSpareroom so back-to-back calls for the same
    // postcode return the same listings — fixes the flap where one fetch
    // lands 10 listings and the next lands 0 from the live scraper.
    try {
      const data = await cachedFlaskSpareroom(
        postcode.toUpperCase(),
        maxResults || 12,
        async () => {
          const response = await fetch(`${FLASK_URL}/api/comparables`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              postcode: postcode.toUpperCase(),
              maxResults: maxResults || 12,
            }),
          })
          return await response.json()
        }
      )
      const safe = data ?? {}
      console.log(
        "[HMO-ROUTE] Flask fallback - success:",
        (safe as { success?: boolean }).success,
        "count:",
        (safe as { count?: number }).count
      )
      return NextResponse.json(safe)
    } catch (flaskErr) {
      console.error("[HMO-ROUTE] Flask fallback also failed:", flaskErr)
    }

    // ── Final fallback: manual search links ────────────────────────────────
    const district = postcode.split(" ")[0].toLowerCase()
    return NextResponse.json({
      success: true,
      listings: [],
      count: 0,
      source: "manual",
      manualSearch: true,
      searchUrl: `https://www.spareroom.co.uk/flatshare/${district}`,
      openrentUrl: `https://www.openrent.co.uk/properties-to-rent/${district}`,
      message: "No automated room listing data available. Search manually.",
    })
  } catch (error) {
    console.error("[HMO-ROUTE] Error:", error)
    return NextResponse.json(
      { success: false, message: "Unable to fetch HMO room data." },
      { status: 500 }
    )
  }
}

// ── Map PropertyData HMO response to the format hmo-comparables.tsx expects ──

function mapPropertyDataToHmoResponse(pd: HmoRentsResponse, postcode: string) {
  const roomTypes = ["double-ensuite", "double-shared-bath", "single-ensuite", "single-shared-bath"] as const
  const listings: Array<Record<string, unknown>> = []
  const roomSummaries: Array<{
    roomType: string
    avgWeekly: number
    avgMonthly: number
    range70: [number, number]
    range100: [number, number]
    count: number
    radius: string
  }> = []

  for (const roomType of roomTypes) {
    const room = pd.data[roomType]
    if (!room) continue

    const avgMonthly = weeklyToMonthly(room.average)
    const range70 = room["70pc_range"]
    const range100 = room["100pc_range"]

    roomSummaries.push({
      roomType: mapRoomType(roomType),
      avgWeekly: room.average,
      avgMonthly,
      range70,
      range100,
      count: room.points_analysed,
      radius: room.radius,
    })

    // Map raw data points to the listing format hmo-comparables.tsx expects
    for (const point of room.raw_data.slice(0, 3)) {
      const monthlyRent = weeklyToMonthly(point.price)
      listings.push({
        title: `${mapRoomType(roomType)} — £${monthlyRent}/mo`,
        address: pd.postcode,
        postcode: pd.postcode,
        monthly_rent: monthlyRent,
        bills_included: point.bills_inc === 1 ? "Yes" : "No",
        num_rooms: null,
        room_type: mapRoomType(roomType),
        available_from: "Now",
        listing_url: "",
        image_url: "",
        distance_km: parseFloat(point.distance) || null,
        source: "propertydata",
      })
    }
  }

  // Calculate overall stats
  const allRents = listings
    .filter((l) => (l.monthly_rent as number) > 0)
    .map((l) => l.monthly_rent as number)
  const avgRent = allRents.length > 0
    ? Math.round(allRents.reduce((a, b) => a + b, 0) / allRents.length)
    : 0

  // Build search area from postcode district
  const searchArea = postcode.split(" ")[0] || postcode

  return {
    success: true,
    listings,
    count: listings.length,
    source: "propertydata",
    searchArea,
    roomSummaries,
    hmoAttributes: pd.data.attributes || null,
    message: `${roomSummaries.length} room types found via PropertyData`,
    stats: {
      avgMonthlyRent: avgRent,
      roomTypesFound: roomSummaries.length,
      totalDataPoints: roomSummaries.reduce((sum, r) => sum + r.count, 0),
    },
  }
}
