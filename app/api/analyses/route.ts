import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { logAdminActivity, ipFromRequest } from "@/lib/admin-logs"

// GET /api/analyses — fetch the logged-in user's saved analyses
export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("saved_analyses")
    .select(
      "id, created_at, address, postcode, investment_type, purchase_price, deal_score, monthly_cashflow, annual_cashflow, gross_yield"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20)

  if (error) {
    console.error("[GET /api/analyses]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ analyses: data })
}

// POST /api/analyses — save a new analysis for the logged-in user
export async function POST(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const {
    address,
    postcode,
    investment_type,
    purchase_price,
    deal_score,
    monthly_cashflow,
    annual_cashflow,
    gross_yield,
    form_data,
    results,
    ai_text,
    backend_data,
  } = body

  const { data, error } = await supabase
    .from("saved_analyses")
    .insert({
      user_id: user.id,
      address,
      postcode,
      investment_type,
      purchase_price,
      deal_score,
      monthly_cashflow,
      annual_cashflow,
      gross_yield,
      form_data,
      results,
      ai_text,
      backend_data,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[POST /api/analyses]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fire-and-forget activity log so the admin dashboard surfaces
  // saved-deal events without blocking the response on a Supabase
  // round-trip. logAdminActivity swallows its own errors.
  logAdminActivity({
    eventType: "saved_deal",
    userId: user.id,
    userEmail: user.email ?? null,
    metadata: {
      analysis_id: data.id,
      address: typeof address === "string" ? address : null,
      postcode: typeof postcode === "string" ? postcode : null,
      investment_type:
        typeof investment_type === "string" ? investment_type : null,
    },
    ipAddress: ipFromRequest(req),
  }).catch(() => {})

  return NextResponse.json({ id: data.id }, { status: 201 })
}
