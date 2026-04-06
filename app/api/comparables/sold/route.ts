import { NextResponse } from "next/server"
import { mapPropertyType, weeklyToMonthly } from "@/lib/propertydata"
import { cachedGetSoldPrices, cachedGetAskingPrices } from "@/lib/propertydata-cache"

const FLASK_URL = process.env.BACKEND_API_URL || "https://metusa-deal-analyzer.onrender.com"

/**
 * Sold Comparables — /api/comparables/sold
 *
 * Primary: PropertyData /sold-prices (Land Registry data with addresses)
 * Enrichment: PropertyData /prices (current asking prices for valuation estimate)
 * Fallback: Flask /api/sold-prices
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { postcode, bedrooms, propertyTypeDetail, propertyType, tenureType } = body

    if (!postcode) {
      return NextResponse.json(
        { success: false, message: "Postcode is required" },
        { status: 400 }
      )
    }

    console.log("[SOLD-ROUTE] Fetching sold prices - postcode:", postcode, "bedrooms:", bedrooms)

    // ── Primary: PropertyData /sold-prices ──────────────────────────────────
    const pdSold = await cachedGetSoldPrices(postcode, bedrooms)

    if (pdSold && pdSold.status === "success" && pdSold.data) {
      const raw = pdSold.data.raw_data || []

      // Map to the format property-comparables.tsx expects
      const sales = raw
        .filter((s) => s.price > 100) // filter out obvious anomalies (£700 leasehold transfers)
        .map((s) => ({
          price: s.price,
          date: s.date,
          street: s.address,
          propertyType: mapPropertyType(s.type || ""),
          tenure: s.tenure || "",
          bedrooms: s.bedrooms,
          distance: s.distance,
        }))

      const validPrices = sales.filter((s) => s.price > 1000).map((s) => s.price)
      const average = validPrices.length > 0
        ? Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length)
        : pdSold.data.average

      // Also fetch asking prices for valuation estimate (non-blocking)
      let valuationEstimate: { average: number; range: [number, number]; count: number } | null = null
      try {
        const pdPrices = await cachedGetAskingPrices(postcode, bedrooms)
        if (pdPrices && pdPrices.status === "success" && pdPrices.data) {
          valuationEstimate = {
            average: pdPrices.data.average,
            range: pdPrices.data["100pc_range"],
            count: pdPrices.data.points_analysed,
          }
        }
      } catch {
        // Non-critical — valuation estimate is a bonus
      }

      console.log("[SOLD-ROUTE] PropertyData success -", sales.length, "sales, avg:", average)

      return NextResponse.json({
        success: true,
        source: "propertydata",
        data: {
          sales,
          average,
          count: sales.length,
          radiusMiles: parseFloat(pdSold.data.radius) * 0.621, // km to miles approx
          dateRange: {
            earliest: pdSold.data.date_earliest,
            latest: pdSold.data.date_latest,
          },
          confidenceRange: {
            "70pc": pdSold.data["70pc_range"],
            "90pc": pdSold.data["90pc_range"],
          },
        },
        valuationEstimate,
      })
    }

    console.log("[SOLD-ROUTE] PropertyData failed, falling back to Flask")

    // ── Fallback: Flask backend ────────────────────────────────────────────
    const response = await fetch(`${FLASK_URL}/api/sold-prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postcode: postcode.toUpperCase(),
        ...(propertyTypeDetail ? { propertyTypeDetail } : {}),
        ...(propertyType ? { propertyType } : {}),
        ...(tenureType ? { tenureType } : {}),
        ...(bedrooms ? { bedrooms } : {}),
      }),
    })

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[SOLD-ROUTE] Error:", error)
    return NextResponse.json(
      { success: false, message: "Failed to fetch sold prices" },
      { status: 500 }
    )
  }
}
