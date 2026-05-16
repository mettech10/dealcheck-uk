/**
 * /api/portfolio — CRUD endpoints for the Portfolio Tracker tool.
 *
 * Auth-gated (RLS on the table also enforces user isolation as a
 * second layer). All derived fields (gross_yield, net_yield, ltv,
 * equity, monthly_cashflow) are computed server-side on insert /
 * update so the displayed numbers can never drift from the inputs.
 *
 * Tier rules (Section 7):
 *   - Free tier:  hard cap of 3 properties — POST returns 402
 *                 with code `portfolio_cap_reached` when exceeded
 *   - PPA / Pro / Enterprise: unlimited
 */

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"
import { tierFromId } from "@/lib/tiers"

const FREE_PORTFOLIO_CAP = 3

// ── Derived-field calculator ─────────────────────────────────────────

interface FinanceShape {
  purchase_price: number
  current_value: number
  outstanding_mortgage: number
  monthly_rent: number
  monthly_mortgage: number
  monthly_expenses: number
}
function deriveSnapshot(f: FinanceShape) {
  const monthlyRevenue = f.monthly_rent
  const monthlyOutgoings = f.monthly_mortgage + f.monthly_expenses
  const monthlyCashflow = monthlyRevenue - monthlyOutgoings
  const annualRevenue = monthlyRevenue * 12
  const annualNet = monthlyCashflow * 12
  const equity = f.current_value - f.outstanding_mortgage
  const equityGain = f.current_value - f.purchase_price
  const equityGainPct =
    f.purchase_price > 0 ? (equityGain / f.purchase_price) * 100 : 0
  const grossYield =
    f.current_value > 0 ? (annualRevenue / f.current_value) * 100 : 0
  const netYield =
    f.current_value > 0 ? (annualNet / f.current_value) * 100 : 0
  const ltv =
    f.current_value > 0 ? (f.outstanding_mortgage / f.current_value) * 100 : 0
  return {
    gross_yield: Math.round(grossYield * 100) / 100,
    net_yield: Math.round(netYield * 100) / 100,
    monthly_cashflow: Math.round(monthlyCashflow * 100) / 100,
    ltv: Math.round(ltv * 100) / 100,
    equity: Math.round(equity * 100) / 100,
    equity_gain: Math.round(equityGain * 100) / 100,
    equity_gain_percent: Math.round(equityGainPct * 100) / 100,
  }
}

// ── GET — list user's portfolio + aggregate stats ────────────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: properties, error } = await supabase
    .from("portfolio_properties")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Portfolio fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch portfolio" }, { status: 500 })
  }

  const rows = properties ?? []
  const sumVal = rows.reduce((s, p) => s + Number(p.current_value || 0), 0)
  const sumDebt = rows.reduce((s, p) => s + Number(p.outstanding_mortgage || 0), 0)
  const sumRent = rows.reduce((s, p) => s + Number(p.monthly_rent || 0), 0)
  const sumCf   = rows.reduce((s, p) => s + Number(p.monthly_cashflow || 0), 0)
  const totalEquity = sumVal - sumDebt
  const portfolioGrossYield = sumVal > 0 ? (sumRent * 12 / sumVal) * 100 : 0
  const avgLtv = sumVal > 0 ? (sumDebt / sumVal) * 100 : 0

  return NextResponse.json({
    properties: rows,
    stats: {
      total_properties: rows.length,
      total_value: sumVal,
      total_equity: totalEquity,
      total_monthly_gross_income: sumRent,
      total_monthly_cashflow: sumCf,
      portfolio_gross_yield: portfolioGrossYield,
      avg_ltv: avgLtv,
    },
  })
}

// ── POST — add property (with tier cap) ──────────────────────────────

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  // Required fields
  for (const k of ["address", "purchase_price", "current_value", "monthly_rent"]) {
    if (body[k] === undefined || body[k] === null || body[k] === "") {
      return NextResponse.json({ error: `${k} is required` }, { status: 400 })
    }
  }

  // Tier cap check (Free = 3, paid tiers unlimited)
  const admin = createAdminClient()
  const { data: tierRow } = await admin.rpc("get_user_tier", { p_user_id: user.id })
  const tierId = (Array.isArray(tierRow) ? tierRow[0]?.tier : tierRow?.tier) ?? "free"
  const tier = tierFromId(tierId)
  if (tier.id === "free") {
    const { count } = await supabase
      .from("portfolio_properties")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
    if ((count ?? 0) >= FREE_PORTFOLIO_CAP) {
      return NextResponse.json(
        {
          error: `Free tier limit reached — Pro unlocks unlimited portfolio tracking. You currently have ${count ?? 0}/${FREE_PORTFOLIO_CAP} properties.`,
          code: "portfolio_cap_reached",
          cap: FREE_PORTFOLIO_CAP,
        },
        { status: 402 },
      )
    }
  }

  const finance: FinanceShape = {
    purchase_price: Number(body.purchase_price) || 0,
    current_value: Number(body.current_value) || 0,
    outstanding_mortgage: Number(body.outstanding_mortgage) || 0,
    monthly_rent: Number(body.monthly_rent) || 0,
    monthly_mortgage: Number(body.monthly_mortgage) || 0,
    monthly_expenses: Number(body.monthly_expenses) || 0,
  }
  const derived = deriveSnapshot(finance)

  const insertRow = {
    user_id: user.id,
    nickname: body.nickname || null,
    address: body.address,
    postcode: body.postcode || null,
    property_type: body.property_type || null,
    bedrooms: body.bedrooms ?? null,
    strategy: body.strategy || null,
    purchase_price: finance.purchase_price,
    purchase_date: body.purchase_date || null,
    current_value: finance.current_value,
    outstanding_mortgage: finance.outstanding_mortgage,
    mortgage_rate: body.mortgage_rate ?? null,
    mortgage_type: body.mortgage_type || null,
    monthly_rent: finance.monthly_rent,
    monthly_mortgage: finance.monthly_mortgage,
    monthly_expenses: finance.monthly_expenses,
    number_of_rooms: body.number_of_rooms ?? null,
    rent_per_room: body.rent_per_room ?? null,
    status: body.status || "owned",
    notes: body.notes || null,
    analysis_id: body.analysis_id || null,
    ...derived,
  }

  const { data, error } = await supabase
    .from("portfolio_properties")
    .insert(insertRow)
    .select()
    .single()

  if (error) {
    console.error("Portfolio insert error:", error)
    return NextResponse.json({ error: "Failed to add property" }, { status: 500 })
  }
  return NextResponse.json({ property: data }, { status: 201 })
}

// ── PATCH — update property ──────────────────────────────────────────

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  // Fetch existing to merge for derived recalc
  const { data: existing } = await supabase
    .from("portfolio_properties")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const merged = { ...existing, ...updates }
  const finance: FinanceShape = {
    purchase_price: Number(merged.purchase_price) || 0,
    current_value: Number(merged.current_value) || 0,
    outstanding_mortgage: Number(merged.outstanding_mortgage) || 0,
    monthly_rent: Number(merged.monthly_rent) || 0,
    monthly_mortgage: Number(merged.monthly_mortgage) || 0,
    monthly_expenses: Number(merged.monthly_expenses) || 0,
  }
  const derived = deriveSnapshot(finance)

  const { data, error } = await supabase
    .from("portfolio_properties")
    .update({ ...updates, ...derived })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) {
    console.error("Portfolio patch error:", error)
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
  return NextResponse.json({ property: data })
}

// ── DELETE — remove property ────────────────────────────────────────

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  const { error } = await supabase
    .from("portfolio_properties")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) {
    console.error("Portfolio delete error:", error)
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
