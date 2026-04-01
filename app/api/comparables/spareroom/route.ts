import { NextResponse } from "next/server"

const FLASK_URL = process.env.BACKEND_API_URL || "https://metusa-deal-analyzer.onrender.com"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { postcode, maxResults } = body

    if (!postcode) {
      return NextResponse.json(
        { success: false, message: "Postcode is required" },
        { status: 400 }
      )
    }

    console.log("[HMO-ROUTE] Proxying SpareRoom request - postcode:", postcode, "maxResults:", maxResults)

    // Proxy to Flask backend /api/comparables (SpareRoom endpoint)
    const response = await fetch(`${FLASK_URL}/api/comparables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postcode: postcode.toUpperCase(),
        maxResults: maxResults || 12,
      }),
    })

    console.log("[HMO-ROUTE] Flask response status:", response.status)

    const data = await response.json()

    console.log("[HMO-ROUTE] Flask response - success:", data.success, "count:", data.count)

    return NextResponse.json(data)

  } catch (error) {
    console.error("[HMO-ROUTE] SpareRoom proxy error:", error)
    return NextResponse.json(
      { success: false, message: "Unable to fetch SpareRoom data. Please try again." },
      { status: 500 }
    )
  }
}
