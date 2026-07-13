import { NextResponse } from "next/server"
import { createHash } from "crypto"
import Anthropic from "@anthropic-ai/sdk"
import { getSessionUser } from "@/lib/apiAuth"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * AI Refurb Estimator — POST /api/analysis/refurb
 *
 * Sends up to 8 scraped listing photos (as URLs) to Claude vision and
 * returns a structured room-by-room refurbishment cost breakdown.
 *
 * - Session-gated: vision calls cost real money; anonymous callers get 401
 *   and the UI falls back to the static tier table.
 * - Cached in scraper_cache for 7 days keyed on photos+strategy+condition —
 *   the same listing re-analysed doesn't re-bill.
 * - Model resolves like lib/aiGateway.ts: AI_MODEL / ANTHROPIC_MODEL env,
 *   default claude-sonnet-4-6.
 * - Every failure path returns { fallback: true } so the client can drop
 *   to the static estimates without special-casing.
 */

export const maxDuration = 120
export const runtime = "nodejs"

const MAX_PHOTOS = 8
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const REGIONAL_MULTIPLIERS: Record<string, number> = {
  London: 1.45,
  "South East": 1.25,
  "South West": 1.1,
  "East of England": 1.15,
  "West Midlands": 0.95,
  "East Midlands": 0.9,
  "Yorkshire and The Humber": 0.88,
  "North West": 0.87,
  "North East": 0.82,
  Wales: 0.85,
  Scotland: 0.9,
}

function regionalMultiplier(region: string): number {
  const lower = region.toLowerCase()
  for (const [area, mult] of Object.entries(REGIONAL_MULTIPLIERS)) {
    if (lower.includes(area.toLowerCase())) return mult
  }
  return 1.0
}

function buildPrompt(p: {
  propertyType: string
  bedrooms: string
  bathrooms: string
  floorM2: string
  floorSqft: string
  region: string
  strategy: string
  price: number
  condition: string
  multiplier: number
  photoCount: number
}): string {
  return `You are an expert UK property refurbishment surveyor with 20+ years experience assessing residential properties for investment.

PROPERTY DETAILS:
Type: ${p.propertyType}
Bedrooms: ${p.bedrooms}
Bathrooms: ${p.bathrooms}
Floor size: ${p.floorM2}m² (${p.floorSqft} sq ft)
Region: ${p.region}
Investment strategy: ${p.strategy}
Purchase price: £${p.price.toLocaleString("en-GB")}
Buyer's own condition guess: ${p.condition}

REGIONAL COST CONTEXT:
This property is in ${p.region}. UK labour and material costs for this region have a multiplier of ${p.multiplier}x versus the national average. Adjust all cost estimates accordingly.

Analyse the photos above and provide a detailed room-by-room refurbishment cost assessment. For EACH room/area visible assess: current condition, specific work needed, cost range (low/mid/high in £), and whether it is essential or optional for rental/investment purposes. Then provide an overall summary.

IMPORTANT COST GUIDELINES (before regional multiplier):
Kitchen full replacement: £5,000-£15,000 · Kitchen cosmetic: £1,000-£3,000
Bathroom full: £3,000-£7,000 · Bathroom cosmetic: £500-£1,500
Flooring per m²: carpet £15-25, LVT £25-40, engineered wood £40-70
Replastering per room: £400-£800 · Full rewire 3-bed: £4,000-£8,000
Boiler replacement: £2,000-£4,000 · New roof: £5,000-£15,000
Windows per unit: £400-£800 · Damp treatment: £500-£3,000
Full decoration per room: £300-£600 · Landscaping/garden: £500-£3,000

Keep every notes/reasoning/recommendation string CONCISE — under 20 words. Cover at most 8 rooms.

RESPOND ONLY WITH JSON IN EXACTLY THIS SHAPE (no other text, no markdown fences):

{
  "overallCondition": "move_in_ready|cosmetic|light_refurb|full_refurb|structural",
  "conditionConfidence": "high|medium|low",
  "conditionReasoning": "One sentence explaining the condition assessment",
  "rooms": [
    {
      "room": "Kitchen",
      "condition": "poor|fair|good|excellent",
      "visible": true,
      "workNeeded": ["Replace kitchen units", "New worktops"],
      "isEssential": true,
      "costLow": 5000,
      "costMid": 8000,
      "costHigh": 12000,
      "notes": "1970s units, cracked tiles visible"
    }
  ],
  "additionalItems": [
    {
      "item": "Full rewire",
      "reason": "Older fuse box visible, likely pre-2000",
      "isEssential": true,
      "costLow": 4000,
      "costMid": 5500,
      "costHigh": 8000
    }
  ],
  "photosAnalysed": ${p.photoCount},
  "roomsVisible": ["Kitchen", "Living room"],
  "roomsNotVisible": ["Loft", "Cellar"],
  "totals": {
    "essentialOnlyLow": 15000,
    "essentialOnlyMid": 22000,
    "essentialOnlyHigh": 30000,
    "fullRefurbLow": 18000,
    "fullRefurbMid": 26000,
    "fullRefurbHigh": 38000
  },
  "strategyRecommendation": {
    "recommended": "light_refurb",
    "reasoning": "One or two sentences tailored to the ${p.strategy} strategy at this price point.",
    "estimatedValueAdd": 15000,
    "estimatedRentIncrease": 75
  },
  "redFlags": [
    {
      "flag": "Possible damp",
      "location": "Living room corner wall",
      "severity": "low|medium|high",
      "estimatedCost": 1500,
      "recommendation": "Commission damp survey before purchase"
    }
  ],
  "limitations": ["Roof condition not visible from photos"]
}`
}

function tryAdminClient() {
  try {
    return createAdminClient()
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorised", fallback: true },
      { status: 401 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid body", fallback: true },
      { status: 400 },
    )
  }

  const images = (Array.isArray(body.images) ? body.images : [])
    .filter((u): u is string => typeof u === "string" && u.startsWith("https://"))
    .slice(0, MAX_PHOTOS)

  if (images.length === 0) {
    return NextResponse.json(
      { error: "No photos available", fallback: true },
      { status: 400 },
    )
  }

  const region = String(body.region || "UK")
  const strategy = String(body.strategy || "BTL")
  const condition = String(body.condition || "unknown")
  const price = Number(body.purchasePrice) || 0
  const multiplier = regionalMultiplier(region)

  console.log(
    `[REFURB-VISION] Analysing ${images.length} photos for ${body.postcode ?? "?"} (${strategy}, ${region})`,
  )

  // ── Cache — same listing + strategy + condition = same answer ──────────
  const cacheKey = `refurb_${createHash("sha256")
    .update(JSON.stringify({ images, strategy, condition, price: Math.round(price / 5000) }))
    .digest("hex")
    .slice(0, 32)}`
  const supabase = tryAdminClient()

  if (supabase) {
    const { data: cached } = await supabase
      .from("scraper_cache")
      .select("data, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle()
    if (
      cached?.data &&
      Date.now() - new Date(cached.created_at).getTime() < CACHE_TTL_MS
    ) {
      console.log("[REFURB-VISION] cache hit", { cacheKey })
      return NextResponse.json({ ...(cached.data as object), fromCache: true })
    }
  }

  // ── Build the vision message ────────────────────────────────────────────
  const content: Anthropic.ContentBlockParam[] = []
  images.forEach((url, i) => {
    content.push({ type: "image", source: { type: "url", url } })
    content.push({ type: "text", text: `Photo ${i + 1} of ${images.length}` })
  })
  content.push({
    type: "text",
    text: buildPrompt({
      propertyType: String(body.propertyType || "residential"),
      bedrooms: String(body.bedrooms ?? "unknown"),
      bathrooms: String(body.bathrooms ?? "unknown"),
      floorM2: String(body.floorSizeM2 ?? "unknown"),
      floorSqft: String(body.floorSizeSqft ?? "unknown"),
      region,
      strategy,
      price,
      condition,
      multiplier,
      photoCount: images.length,
    }),
  })

  try {
    const client = new Anthropic()
    const model =
      process.env.AI_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6"

    const response = await client.messages.create({
      model,
      // Room-by-room JSON with 8 rooms + red flags runs well past 3k
      // tokens — a tight cap truncates mid-JSON and the parse fails.
      max_tokens: 6000,
      messages: [{ role: "user", content }],
    })

    const textBlock = response.content.find((b) => b.type === "text")
    let responseText = textBlock && textBlock.type === "text" ? textBlock.text : ""
    console.log(
      `[REFURB-VISION] response: stop=${response.stop_reason} len=${responseText.length}`,
      responseText.slice(0, 160),
    )

    // Strip markdown fences if the model wrapped the JSON anyway.
    responseText = responseText
      .replace(/^\s*```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim()

    // Parse — direct first, then the outermost JSON object as a rescue.
    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(responseText)
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          parsed = JSON.parse(match[0])
        } catch {
          parsed = null
        }
      }
    }

    if (!parsed || !parsed.totals || !Array.isArray(parsed.rooms)) {
      console.error(
        `[REFURB-VISION] unparseable/incomplete response (stop=${response.stop_reason}, len=${responseText.length}, tail=${JSON.stringify(responseText.slice(-120))})`,
      )
      return NextResponse.json(
        { error: "Failed to parse AI response", fallback: true },
        { status: 502 },
      )
    }

    const result = {
      ...parsed,
      analysedByAI: true,
      photosUsed: images.length,
      region,
      regionalMultiplier: multiplier,
    }

    if (supabase) {
      await supabase.from("scraper_cache").upsert(
        {
          cache_key: cacheKey,
          data: result,
          source: "refurb-vision",
          created_at: new Date().toISOString(),
        },
        { onConflict: "cache_key" },
      )
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error(
      "[REFURB-VISION] error:",
      err instanceof Error ? err.message : String(err),
    )
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Vision analysis failed",
        fallback: true,
      },
      { status: 502 },
    )
  }
}
