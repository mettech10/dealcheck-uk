/**
 * POST /api/arv/calculate
 *
 * Proxies to Flask /api/arv/calculate. Used by both the BRRRR ARV field
 * and (once Section 3 lands) the Flip ARV field.
 *
 * Body: { postcode, propertyType?, propertyTypeDetail?, bedrooms, floorSizeM2? }
 *
 * The Flask endpoint never 500s — it returns structured { error, message,
 * comparablesUsed } envelopes on failure, so the UI can show "enter
 * manually" without blocking analysis.
 */
import { NextResponse } from "next/server"

const FLASK_URL =
  process.env.BACKEND_API_URL || "https://metusa-deal-analyzer.onrender.com"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { postcode } = body || {}

    if (!postcode) {
      return NextResponse.json(
        {
          error: "postcode is required",
          message: "Enter a postcode or set ARV manually",
          comparablesUsed: 0,
        },
        { status: 400 },
      )
    }

    const resp = await fetch(`${FLASK_URL}/api/arv/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Land Registry SPARQL can be slow + the service widens up to 1 mi,
      // so give the backend real headroom.
      signal: AbortSignal.timeout(45_000),
    })

    const data = await resp.json().catch(() => ({
      error: "Invalid JSON from ARV service",
      message: "Auto-ARV unavailable — enter manually",
      comparablesUsed: 0,
    }))
    return NextResponse.json(data, { status: resp.ok ? 200 : resp.status })
  } catch (error) {
    console.error("[ARV] proxy error:", error)
    return NextResponse.json(
      {
        error: String(error),
        message: "Auto-ARV failed — please enter ARV manually",
        comparablesUsed: 0,
      },
      { status: 200 },
    )
  }
}
