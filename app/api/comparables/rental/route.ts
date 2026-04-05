import { NextResponse } from "next/server"
import { getRents, weeklyToMonthly } from "@/lib/propertydata"

/**
 * Rental Valuation Estimate — /api/comparables/rental
 *
 * Primary: PropertyData /rents (live asking rents)
 * Returns: monthly rent estimate, confidence range, source data
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { postcode, bedrooms } = body

    if (!postcode) {
      return NextResponse.json(
        { success: false, message: "Postcode is required" },
        { status: 400 }
      )
    }

    console.log("[RENTAL-ROUTE] Fetching rental estimate - postcode:", postcode, "bedrooms:", bedrooms)

    const pdRents = await getRents(postcode, bedrooms || undefined)

    if (pdRents && pdRents.status === "success" && pdRents.data?.long_let) {
      const ll = pdRents.data.long_let
      const monthlyAvg = weeklyToMonthly(ll.average)
      const range70 = ll["70pc_range"]
      const range100 = ll["100pc_range"]

      // Determine confidence based on radius — smaller = more data nearby = higher confidence
      const radius = parseFloat(ll.radius)
      const confidence = radius <= 0.5 ? "high" : radius <= 1.5 ? "medium" : "low"

      console.log("[RENTAL-ROUTE] PropertyData success - avg £" + monthlyAvg + "/mo, radius:", ll.radius + "km,", ll.points_analysed, "points")

      return NextResponse.json({
        success: true,
        source: "propertydata",
        data: {
          monthly: monthlyAvg,
          confidence,
          range: {
            low: weeklyToMonthly(range70[0]),
            high: weeklyToMonthly(range70[1]),
          },
          fullRange: {
            low: weeklyToMonthly(range100[0]),
            high: weeklyToMonthly(range100[1]),
          },
          pointsAnalysed: ll.points_analysed,
          radius: ll.radius,
        },
      })
    }

    console.log("[RENTAL-ROUTE] PropertyData failed — no rental data available")

    return NextResponse.json({
      success: false,
      message: "Rental data not available for this postcode",
    })
  } catch (error) {
    console.error("[RENTAL-ROUTE] Error:", error)
    return NextResponse.json(
      { success: false, message: "Failed to fetch rental estimates" },
      { status: 500 }
    )
  }
}
