import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/apiAuth"

const BACKEND_API_URL =
  process.env.BACKEND_API_URL || "https://metusa-deal-analyzer.onrender.com"

// Same rationale as /api/analyse — strategy-aware area analysis builds
// a large prompt + waits on Claude. Default 10s hobby cap was the
// underlying reason the UI showed "The operation was aborted due to
// timeout" on fresh runs.
export const maxDuration = 120
export const runtime = "nodejs"

/**
 * Proxies POST /api/analysis/area to the Flask backend, which generates
 * a 5-section AI area analysis (market overview, fundamentals, deal in
 * context, key risks, investor verdict) and caches it for 24h.
 */
export async function POST(req: Request) {
  const sessionUser = await getSessionUser()
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { postcode, strategy, dealData, benchmark, articleFour, marketContext } = body

    if (!postcode) {
      return NextResponse.json(
        { success: false, message: "postcode required" },
        { status: 400 }
      )
    }

    const upstream = await fetch(`${BACKEND_API_URL}/api/analysis/area`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcode, strategy, dealData, benchmark, articleFour, marketContext }),
      // Render free tier + Anthropic latency on a large strategy-aware
      // prompt routinely lands at 30-60s. 45s was breaching mid-call;
      // 90s gives Claude enough headroom while still failing fast
      // enough that the UI shows the error instead of hanging forever.
      signal: AbortSignal.timeout(90_000),
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
