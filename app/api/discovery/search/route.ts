/**
 * POST /api/discovery/search — create a discovery search and start it.
 * GET  /api/discovery/search — list the caller's searches + usage.
 *
 * Pro-tier gated BEFORE any processing: a run spends real Bright Data
 * scraping credits, so the gate is checked before the row is even created.
 */
import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/apiAuth"
import { createAdminClient } from "@/lib/supabase/admin"
import { DiscoveryAgent } from "@/lib/agents/DiscoveryAgent"
import {
  checkDiscoveryAccess,
  recordDiscoveryUsed,
  getDiscoveryUsage,
  DISCOVERY_MAX_AREAS,
  DISCOVERY_MONTHLY_LIMIT,
} from "@/lib/discovery/gate"

export const runtime = "nodejs"
export const maxDuration = 300
export const dynamic = "force-dynamic"

const VALID_STRATEGIES = new Set(["BTL", "HMO", "BRRRR", "SA", "FLIP"])

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from("discovery_searches")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50)

  const gate = await checkDiscoveryAccess(user.id)
  return NextResponse.json({
    searches: data ?? [],
    usage: {
      used: await getDiscoveryUsage(user.id),
      limit: DISCOVERY_MONTHLY_LIMIT,
      tier: gate.tier,
      allowed: gate.allowed,
      reason: gate.reason,
      message: gate.message,
    },
  })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  // ── Gate FIRST — before any scraping work is scheduled ────────────────
  const gate = await checkDiscoveryAccess(user.id)
  if (!gate.allowed) {
    return NextResponse.json(
      {
        error: gate.message,
        code: gate.reason === "tier" ? "pro_required" : "limit_reached",
        used: gate.used,
        limit: gate.limit,
        tier: gate.tier,
      },
      { status: 403 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // ── Validate ─────────────────────────────────────────────────────────
  const areas = Array.isArray(body.postcodeAreas)
    ? [...new Set((body.postcodeAreas as unknown[]).map((a) => String(a).trim().toUpperCase()).filter(Boolean))]
    : []
  if (areas.length === 0) {
    return NextResponse.json({ error: "At least one postcode area is required" }, { status: 400 })
  }
  if (areas.length > DISCOVERY_MAX_AREAS) {
    return NextResponse.json(
      { error: `Maximum ${DISCOVERY_MAX_AREAS} postcode areas per search`, code: "too_many_areas" },
      { status: 400 },
    )
  }
  // Outcode format, e.g. M14 / SW1A / B29.
  const badArea = areas.find((a) => !/^[A-Z]{1,2}\d[A-Z\d]?$/.test(a))
  if (badArea) {
    return NextResponse.json(
      { error: `"${badArea}" isn't a valid postcode area (e.g. M14)` },
      { status: 400 },
    )
  }

  const strategies = Array.isArray(body.strategies)
    ? [...new Set((body.strategies as unknown[]).map((s) => String(s).trim().toUpperCase()))].filter((s) =>
        VALID_STRATEGIES.has(s),
      )
    : []
  if (strategies.length === 0) {
    return NextResponse.json(
      { error: "Select at least one strategy to screen for" },
      { status: 400 },
    )
  }

  const numOrNull = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  const admin = createAdminClient()
  const { data: search, error } = await admin
    .from("discovery_searches")
    .insert({
      user_id: user.id,
      search_name: String(body.searchName ?? "").slice(0, 200) || `${areas.join(", ")} scan`,
      postcode_areas: areas,
      strategies,
      min_price: numOrNull(body.minPrice),
      max_price: numOrNull(body.maxPrice),
      min_bedrooms: numOrNull(body.minBedrooms),
      max_bedrooms: numOrNull(body.maxBedrooms),
      is_recurring: Boolean(body.isRecurring),
      frequency: body.isRecurring ? String(body.frequency ?? "weekly") : null,
      status: "active",
    })
    .select()
    .single()

  if (error || !search) {
    console.error("[discovery/search] insert failed:", error)
    return NextResponse.json({ error: "Could not create search" }, { status: 500 })
  }

  // Only burn an allowance once the row exists.
  await recordDiscoveryUsed(user.id)

  const searchId = (search as unknown as { id: string }).id

  // Fire the run. Vercel freezes the function once the response is sent, so
  // we deliberately AWAIT rather than fire-and-forget — maxDuration 300 covers
  // a 3-area run (scrape + screen + <=15 capped analyses).
  const agent = new DiscoveryAgent()
  try {
    const result = await agent.runSearch(searchId)
    return NextResponse.json({
      searchId,
      status: "complete",
      itemsProcessed: result.itemsProcessed,
      insights: result.insights,
    })
  } catch (err) {
    console.error("[discovery/search] run failed:", err)
    // The search row exists, so the user can retry it from the UI.
    return NextResponse.json(
      { searchId, status: "failed", error: "The discovery run failed — you can retry it." },
      { status: 200 },
    )
  }
}
