import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * POST /api/stats/increment
 * Increments the global deal count by 1.
 * Called from the analysis page after every completed analysis.
 *
 * Requires a signed-in session (the analyse page is auth-gated, so every
 * legitimate increment has one) — an anonymous caller could otherwise
 * inflate the public counter arbitrarily. Increment goes through the
 * atomic RPC only; the old read-then-write fallback raced under
 * concurrency and is gone.
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

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
    }

    const { error: rpcError } = await supabase.rpc("increment_deal_count_rpc")
    if (rpcError) {
      console.error("[INCREMENT] RPC failed:", rpcError.message)
      return NextResponse.json({ error: "Failed to update count" }, { status: 500 })
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
