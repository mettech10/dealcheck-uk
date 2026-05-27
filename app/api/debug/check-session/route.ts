import Stripe from "stripe"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminEmail } from "@/lib/admin"
import {
  sendPaymentConfirmationEmail,
  sendSubscriptionWelcomeEmail,
  sendOwnerPaymentNotification,
} from "@/lib/paymentEmails"

/**
 * GET  /api/debug/check-session?session_id=cs_…
 *   → Admin diagnostic. Returns everything we know about a Stripe
 *     session id: what Stripe says + what payment_history shows +
 *     what user_usage shows for the metadata.user_id.
 *
 * POST /api/debug/check-session?session_id=cs_…&action=force-issue
 *   → Admin RECOVERY. Force-issues the credit + sends the emails
 *     even if payment_history already has a row (overrides the
 *     idempotency check). Use to recover when a payment landed but
 *     verify-session silently failed or wrote a row but never sent
 *     emails / never credited the right pool.
 */

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key, {
    apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion,
  })
}

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

export async function GET(req: Request) {
  const denied = await gate()
  if (denied) return denied

  const stripe = getStripeClient()
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 },
    )
  }

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get("session_id") || ""
  if (!sessionId.startsWith("cs_")) {
    return NextResponse.json(
      { error: "session_id required (cs_…)" },
      { status: 400 },
    )
  }

  // ── 1. What Stripe says ───────────────────────────────────────
  let session: Stripe.Checkout.Session | null = null
  let stripeError: string | null = null
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch (e) {
    stripeError = e instanceof Error ? e.message : "unknown"
  }

  // ── 2. What payment_history says ──────────────────────────────
  const admin = createAdminClient()
  const { data: payments, error: pErr } = await admin
    .from("payment_history")
    .select(
      "id, user_id, amount_gbp, tier, status, description, event_type, credit_delta, created_at",
    )
    .eq("stripe_session_id", sessionId)

  // ── 3. What user_usage + user_subscriptions show for the user ─
  const userId = session?.metadata?.user_id
  let userBlock: Record<string, unknown> | null = null
  if (userId) {
    const [{ data: u }, { data: sub }, { data: usage }] = await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin
        .from("user_subscriptions")
        .select("tier, status, current_period_end, stripe_customer_id")
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("user_usage")
        .select("period_start, paid_analysis_credits, free_analyses_used, total_analyses_this_period")
        .eq("user_id", userId)
        .order("period_start", { ascending: false })
        .limit(3),
    ])
    userBlock = {
      email: u?.user?.email ?? null,
      user_id: userId,
      subscription: sub,
      recent_usage: usage,
    }
  }

  return NextResponse.json({
    sessionId,
    stripe: {
      ok: !stripeError,
      error: stripeError,
      payment_status: session?.payment_status,
      amount_total: session?.amount_total,
      currency: session?.currency,
      customer: session?.customer,
      customer_email: session?.customer_email,
      metadata: session?.metadata,
      mode: session?.mode,
      created: session?.created
        ? new Date(session.created * 1000).toISOString()
        : null,
    },
    paymentHistory: {
      count: payments?.length ?? 0,
      rows: payments ?? [],
      error: pErr?.message ?? null,
    },
    user: userBlock,
    diagnosis: diagnose(session, payments, userBlock),
  })
}

function diagnose(
  session: Stripe.Checkout.Session | null,
  payments: Array<{ event_type: string | null }> | null,
  userBlock: Record<string, unknown> | null,
): string {
  if (!session) return "Stripe session not found — check the session_id"
  if (session.payment_status !== "paid")
    return `Stripe says payment_status=${session.payment_status} — user wasn't actually charged`
  if (!session.metadata?.user_id)
    return "Stripe session missing metadata.user_id — checkout flow didn't tag the user. Credit can't auto-issue."
  if (!userBlock)
    return "Could not resolve user_id from Stripe metadata. Possibly user was deleted."
  const recorded = (payments ?? []).some(
    (p) => p.event_type === "purchase_stripe" || p.event_type === null,
  )
  if (!recorded)
    return "PAID BUT NOT RECORDED — webhook + verify-session both missed this. Use POST ?action=force-issue to recover."
  return "Looks healthy — Stripe says paid, payment_history has the row. If user reports missing credit, check user_usage figures above."
}

// ── POST: force-issue recovery ────────────────────────────────────
export async function POST(req: Request) {
  const denied = await gate()
  if (denied) return denied
  const stripe = getStripeClient()
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 })
  }
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get("session_id") || ""
  const action = searchParams.get("action") ?? ""
  if (!sessionId.startsWith("cs_")) {
    return NextResponse.json(
      { error: "session_id required (cs_…)" },
      { status: 400 },
    )
  }
  if (action !== "force-issue") {
    return NextResponse.json(
      { error: "action=force-issue required" },
      { status: 400 },
    )
  }

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "retrieve failed" },
      { status: 502 },
    )
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json(
      {
        error: `payment_status=${session.payment_status} — refusing to issue`,
      },
      { status: 402 },
    )
  }
  const userId = session.metadata?.user_id
  if (!userId) {
    return NextResponse.json(
      { error: "session missing metadata.user_id — can't attribute to a user" },
      { status: 400 },
    )
  }

  const tier = (session.metadata?.tier as string | undefined) ?? "pay_per_analysis"
  const amountPaid = (session.amount_total ?? (tier === "pro" ? 1999 : 299)) / 100
  const admin = createAdminClient()
  const actions: string[] = []

  try {
    if (tier === "pay_per_analysis") {
      const rawAnalysisId = (session.metadata?.analysis_id || "").trim()
      const UUID_RE =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const boundAnalysisId = UUID_RE.test(rawAnalysisId)
        ? rawAnalysisId
        : null
      const { error } = await admin.rpc("add_analysis_credits", {
        p_user_id: userId,
        p_credits: 1,
        p_tier: "pay_per_analysis",
        p_stripe_session_id: session.id,
        p_amount_gbp: amountPaid,
        p_analysis_id: boundAnalysisId,
      })
      if (error) throw error
      actions.push("add_analysis_credits(+1) called")
    } else if (tier === "pro") {
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null
      await admin
        .from("user_subscriptions")
        .upsert(
          {
            user_id: userId,
            tier: "pro",
            status: "active",
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        )
      await admin.from("payment_history").insert({
        user_id: userId,
        stripe_session_id: session.id,
        amount_gbp: amountPaid,
        tier: "pro",
        status: "succeeded",
        description: "Pro subscription (admin force-issue)",
        event_type: "purchase_stripe",
        credit_delta: 0,
      })
      actions.push("user_subscriptions upserted to pro + payment_history row inserted")
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "issue failed", actions },
      { status: 500 },
    )
  }

  // Send the emails too — same as the original webhook would have.
  const { data: u } = await admin.auth.admin.getUserById(userId)
  const userEmail = u?.user?.email ?? null
  const emailResults: Record<string, boolean> = {}
  if (userEmail) {
    try {
      const sent =
        tier === "pro"
          ? await sendSubscriptionWelcomeEmail({ userEmail })
          : await sendPaymentConfirmationEmail({
              userEmail,
              amount: amountPaid,
              sessionId: session.id,
            })
      emailResults.user_confirmation = !!sent
    } catch (e) {
      console.warn("[force-issue] user email failed:", e)
      emailResults.user_confirmation = false
    }
    try {
      const sent = await sendOwnerPaymentNotification({
        kind: tier === "pro" ? "pro_start" : "ppa_purchase",
        amountGbp: amountPaid,
        userEmail,
        userId,
        stripeSessionId: session.id,
        note: "Admin force-issue via /api/debug/check-session — webhook & verify-session both missed this payment.",
      })
      emailResults.owner_notification = !!sent
    } catch (e) {
      console.warn("[force-issue] owner email failed:", e)
      emailResults.owner_notification = false
    }
  }

  return NextResponse.json({
    ok: true,
    actions,
    emailResults,
    sessionId,
    userId,
  })
}
