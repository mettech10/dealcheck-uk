import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * POST /api/stats/increment
 * Increments the global deal count by 1 — no auth required.
 * Called from the analysis page after every completed analysis.
 *
 * Uses Supabase RPC if available, otherwise falls back to read-then-write.
 * Includes a simple fingerprint check to prevent trivial abuse.
 */
export async function POST(req: Request) {
  try {
    // Basic abuse prevention: require a valid JSON body with a timestamp
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const { ts } = body
    if (!ts || typeof ts !== "number") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    // Reject if timestamp is more than 30 seconds old or in the future
    const now = Date.now()
    if (Math.abs(now - ts) > 30_000) {
      return NextResponse.json({ error: "Stale request" }, { status: 400 })
    }

    const supabase = await createClient()

    // Try RPC first (if the function exists in Supabase)
    const { error: rpcError } = await supabase.rpc("increment_deal_count_rpc")

    if (rpcError) {
      // Fallback: read current count, increment, write back
      console.warn("[INCREMENT] RPC failed, using fallback:", rpcError.message)

      const { data, error: readError } = await supabase
        .from("global_stats")
        .select("deal_count")
        .eq("id", 1)
        .single()

      if (readError || !data) {
        console.error("[INCREMENT] Read failed:", readError)
        return NextResponse.json({ error: "Failed to read count" }, { status: 500 })
      }

      const newCount = (data.deal_count || 0) + 1

      const { error: updateError } = await supabase
        .from("global_stats")
        .update({ deal_count: newCount, updated_at: new Date().toISOString() })
        .eq("id", 1)

      if (updateError) {
        console.error("[INCREMENT] Update failed:", updateError)
        return NextResponse.json({ error: "Failed to update count" }, { status: 500 })
      }

      return NextResponse.json({ count: newCount })
    }

    // RPC succeeded — read the updated value
    const { data } = await supabase
      .from("global_stats")
      .select("deal_count")
      .eq("id", 1)
      .single()

    return NextResponse.json({ count: data?.deal_count ?? null })
  } catch (error) {
    console.error("[INCREMENT] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
