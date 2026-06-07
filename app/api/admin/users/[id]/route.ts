/**
 * GET   /api/admin/users/[id] — full user detail (analyses + payments + sub)
 * PATCH /api/admin/users/[id] — { tier: "free"|"pay_per_analysis"|"pro"|"enterprise" }
 *
 * Both admin-gated.
 *
 * PATCH writes ONLY the local user_subscriptions row. It does NOT
 * sync to Stripe — a real "Upgrade to Pro" requires a Stripe
 * subscription which can only exist via checkout (we can't conjure
 * billing). What this endpoint is for:
 *   - manually promoting test users
 *   - revoking a tier after a refund/dispute
 *   - granting Enterprise without Stripe involvement
 * The frontend surfaces the "no Stripe billing" caveat next to the
 * button.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminEmail } from "@/lib/admin"

export const dynamic = "force-dynamic"

const VALID_TIERS = new Set([
  "free",
  "pay_per_analysis",
  "pro",
  "enterprise",
])

async function gate(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 })
  }
  return null
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await gate()
  if (denied) return denied

  const { id } = await ctx.params
  const admin = createAdminClient()

  const [userRes, subRes, usageRes, paymentsRes, savedRes] = await Promise.all([
    admin.auth.admin.getUserById(id),
    admin.from("user_subscriptions").select("*").eq("user_id", id).maybeSingle(),
    admin
      .from("user_usage")
      .select("*")
      .eq("user_id", id)
      .order("period_start", { ascending: false }),
    admin
      .from("payment_history")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("saved_analyses")
      .select("id, address, investment_type, purchase_price, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  if (userRes.error || !userRes.data?.user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 })
  }
  const u = userRes.data.user

  return NextResponse.json({
    user: {
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      user_metadata: u.user_metadata,
    },
    subscription: subRes.data ?? null,
    usage: usageRes.data ?? [],
    payments: paymentsRes.data ?? [],
    savedAnalyses: savedRes.data ?? [],
  })
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await gate()
  if (denied) return denied

  const { id } = await ctx.params
  let body: { tier?: string } = {}
  try {
    body = (await req.json()) as { tier?: string }
  } catch {
    /* fall through */
  }
  const tier = body.tier
  if (!tier || !VALID_TIERS.has(tier)) {
    return NextResponse.json(
      { error: `tier must be one of ${Array.from(VALID_TIERS).join(", ")}` },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const { error } = await admin.from("user_subscriptions").upsert(
    {
      user_id: id,
      tier,
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  )
  if (error) {
    console.error("[admin/users PATCH] upsert failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, tier })
}
