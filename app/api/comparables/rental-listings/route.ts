import { NextResponse } from "next/server"
import { getRents, weeklyToMonthly, mapPropertyType } from "@/lib/propertydata"

const FLASK_URL = process.env.BACKEND_API_URL || "https://metusa-deal-analyzer.onrender.com"

/**
 * Rental Listings — /api/comparables/rental-listings
 *
 * Primary: PropertyData /rents raw_data (individual listings from Rightmove/Zoopla)
 * Fallback: Flask /api/rental-comparables (Rightmove actor)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { postcode, bedrooms, propertyType, propertyTypeDetail, strategy } = body

    if (!postcode) {
      return NextResponse.json(
        { success: false, message: "Postcode is required" },
        { status: 400 }
      )
    }

    console.log("[RENTAL-LISTINGS] Fetching - postcode:", postcode, "bedrooms:", bedrooms)

    // ── Primary: PropertyData /rents ────────────────────────────────────────
    const pdRents = await getRents(postcode, bedrooms || undefined)

    if (pdRents && pdRents.status === "success" && pdRents.data?.long_let) {
      const ll = pdRents.data.long_let
      const rawListings = ll.raw_data || []

      const listings = rawListings.map((r) => ({
        address: `${mapPropertyType(r.type)} · ${r.distance}km away`,
        monthlyRent: weeklyToMonthly(r.price),
        rentLabel: `£${weeklyToMonthly(r.price)}/mo`,
        bedrooms: r.bedrooms,
        propertyType: mapPropertyType(r.type),
        imageUrl: null,
        listingUrl: null, // PropertyData doesn't provide listing URLs
        agent: r.portal,
        priceFrequency: "monthly",
        source: "propertydata",
        distance: r.distance,
      }))

      const rents = listings.map((l) => l.monthlyRent).filter((r) => r > 0)
      const avgRent = rents.length > 0 ? Math.round(rents.reduce((a, b) => a + b, 0) / rents.length) : 0

      console.log("[RENTAL-LISTINGS] PropertyData success -", listings.length, "listings, avg £" + avgRent + "/mo")

      return NextResponse.json({
        success: true,
        source: "propertydata",
        data: {
          listings,
          count: listings.length,
          averageRent: avgRent,
          minRent: rents.length > 0 ? Math.min(...rents) : 0,
          maxRent: rents.length > 0 ? Math.max(...rents) : 0,
          searchArea: postcode.split(" ")[0],
          message: `${listings.length} rental comparables from PropertyData`,
        },
      })
    }

    console.log("[RENTAL-LISTINGS] PropertyData failed, falling back to Flask")

    // ── Fallback: Flask backend ────────────────────────────────────────────
    try {
      const response = await fetch(`${FLASK_URL}/api/rental-comparables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode: postcode.toUpperCase(),
          bedrooms: bedrooms || 3,
          ...(propertyType ? { propertyType } : {}),
          ...(propertyTypeDetail ? { propertyTypeDetail } : {}),
          ...(strategy ? { strategy } : {}),
        }),
      })

      const data = await response.json()
      return NextResponse.json(data)
    } catch {
      return NextResponse.json({
        success: false,
        message: "Failed to fetch rental comparables",
      })
    }
  } catch (error) {
    console.error("[RENTAL-LISTINGS] Error:", error)
    return NextResponse.json(
      { success: false, message: "Failed to fetch rental comparables" },
      { status: 500 }
    )
  }
}
