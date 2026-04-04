import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Simple in-memory cache (5 min TTL)
let cachedCount: number | null = null
let cachedAt = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * GET /api/stats/deal-count
 * Returns total number of analyses across all users (public, cached 5 min)
 */
export async function GET() {
  try {
    const now = Date.now()

    // Return cached value if fresh
    if (cachedCount !== null && now - cachedAt < CACHE_TTL) {
      return NextResponse.json({
        count: cachedCount,
        cached: true,
        timestamp: new Date().toISOString(),
      })
    }

    const supabase = await createClient()

    // Count all analyses (no auth required — this is a public stat)
    const { count, error } = await supabase
      .from("analyses")
      .select("*", { count: "exact", head: true })

    if (error) {
      console.error("[Stats] Database error:", error)
      // If cache exists, serve stale
      if (cachedCount !== null) {
        return NextResponse.json({ count: cachedCount, cached: true, stale: true })
      }
      return NextResponse.json(
        { error: "Failed to fetch stats" },
        { status: 500 }
      )
    }

    cachedCount = count || 0
    cachedAt = now

    return NextResponse.json({
      count: cachedCount,
      cached: false,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[Stats] Unexpected error:", error)
    if (cachedCount !== null) {
      return NextResponse.json({ count: cachedCount, cached: true, stale: true })
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}