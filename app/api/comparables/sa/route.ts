import { NextResponse } from "next/server"

const FLASK_URL = process.env.BACKEND_API_URL || "https://metusa-deal-analyzer.onrender.com"

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

    const response = await fetch(`${FLASK_URL}/api/sa-comparables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postcode: postcode.toUpperCase(),
        bedrooms: bedrooms || 2,
      }),
    })

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[SA Comparables] Error:", error)
    return NextResponse.json(
      { success: true, listings: [], message: "Failed to fetch SA comparables" },
      { status: 200 }
    )
  }
}
