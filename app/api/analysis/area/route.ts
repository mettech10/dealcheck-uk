import { NextResponse } from "next/server"

const BACKEND_API_URL =
  process.env.BACKEND_API_URL || "https://metusa-deal-analyzer.onrender.com"

/**
 * Proxies POST /api/analysis/area to the Flask backend, which generates
 * a 5-section AI area analysis (market overview, fundamentals, deal in
 * context, key risks, investor verdict) and caches it for 24h.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { postcode, strategy, dealData, benchmark, articleFour } = body

    if (!postcode) {
      return NextResponse.json(
        { success: false, message: "postcode required" },
        { status: 400 }
      )
    }

    const upstream = await fetch(`${BACKEND_API_URL}/api/analysis/area`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcode, strategy, dealData, benchmark, articleFour }),
      signal: AbortSignal.timeout(45_000),
    })

    const data = await upstream.json().catch(() => null)

    if (!upstream.ok || !data?.success) {
      return NextResponse.json(
        {
          success: false,
          message: data?.message || "Area analysis failed",
          fallback: data?.fallback ?? false,
        },
        { status: upstream.status || 502 }
      )
    }

    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json(
      { success: false, message: msg },
      { status: 500 }
    )
  }
}
