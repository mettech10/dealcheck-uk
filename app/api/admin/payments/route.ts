/**
 * GET /api/admin/payments
 *
 * Every row from payment_history, decorated with the payer's email
 * (joined client-side from a one-batch listUsers call). Service-role
 * client bypasses RLS; gated by ADMIN_EMAILS.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminEmail } from "@/lib/admin"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 })
  }

  const admin = createAdminClient()

  // Filter to MONEY-MOVEMENT events only — admin_grant and
  // analysis_used rows live in payment_history too but are always
  // £0, which pollutes the Payments page with zero-value rows that
  // look like failed Stripe captures. Include:
  //   - event_type='purchase_stripe' (PPA + Pro Stripe checkouts)
  //   - event_type='refund'
  //   - legacy rows (event_type IS NULL) where the amount is > 0
  //     so pre-migration purchases still surface
  const [paymentsRes, usersRes] = await Promise.all([
    admin
      .from("payment_history")
      .select(
        "id, user_id, amount_gbp, tier, status, stripe_session_id, created_at, event_type",
      )
      .or(
        "event_type.in.(purchase_stripe,refund),and(event_type.is.null,amount_gbp.gt.0)",
      )
      .order("created_at", { ascending: false })
      .limit(1000),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  const emailByUser: Record<string, string> = {}
  for (const u of usersRes.data?.users ?? []) {
    if (u.id && u.email) emailByUser[u.id] = u.email
  }

  const payments = (paymentsRes.data ?? []).map((row) => {
    const r = row as {
      id: string
      user_id: string
      amount_gbp: number | null
      tier: string | null
      status: string | null
      stripe_session_id: string | null
      created_at: string
    }
    return {
      id: r.id,
      user_id: r.user_id,
      email: emailByUser[r.user_id] ?? "(unknown user)",
      amount_gbp: Number(r.amount_gbp ?? 0),
      tier: r.tier ?? "pay_per_analysis",
      status: r.status ?? "pending",
      stripe_session_id: r.stripe_session_id,
      created_at: r.created_at,
    }
  })

  return NextResponse.json({ payments })
}
