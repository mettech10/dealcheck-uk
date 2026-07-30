/**
 * GET /api/discovery/results/[searchId]
 *
 * Ranked shortlist for a search. Returns Tier 1 passers by default, sorted
 * by best_score DESC (the exact shape of idx_discovery_search), with
 * ?all=true to include everything that was screened — useful for tuning
 * thresholds and for showing the user what was rejected and why.
 *
 * Ownership is enforced explicitly: the search must belong to the caller.
 */
import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/apiAuth"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  ctx: { params: Promise<{ searchId: string }> },
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const { searchId } = await ctx.params
  const url = new URL(request.url)
  const includeAll = url.searchParams.get("all") === "true"
  const strategy = (url.searchParams.get("strategy") ?? "").trim().toUpperCase()
  const sort = url.searchParams.get("sort") ?? "score"

  const admin = createAdminClient()

  // Ownership check — never serve another user's discovery results.
  const { data: search } = await admin
    .from("discovery_searches")
    .select("*")
    .eq("id", searchId)
    .maybeSingle()

  if (!search) return NextResponse.json({ error: "Search not found" }, { status: 404 })
  if ((search as unknown as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let query = admin
    .from("discovery_results")
    .select("*")
    .eq("search_id", searchId)
    .eq("dismissed_by_user", false)

  if (!includeAll) query = query.eq("passed_tier1", true)
  if (strategy) query = query.eq("best_strategy", strategy)

  // Newest / cheapest orderings are offered in the UI; default is the
  // ranked shortlist the index is built for.
  if (sort === "newest") query = query.order("found_at", { ascending: false })
  else if (sort === "price") query = query.order("price", { ascending: true, nullsFirst: false })
  else
    query = query
      .order("best_score", { ascending: false, nullsFirst: false })
      .order("tier1_score", { ascending: false, nullsFirst: false })

  const { data, error } = await query.limit(200)
  if (error) {
    console.error("[discovery/results] query failed:", error)
    return NextResponse.json({ error: "Could not load results" }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
  const analysed = rows.filter((r) => r.status === "analysed")

  return NextResponse.json({
    search,
    results: rows,
    counts: {
      returned: rows.length,
      analysed: analysed.length,
      strong: analysed.filter((r) => Number(r.best_score ?? 0) >= 70).length,
    },
  })
}
