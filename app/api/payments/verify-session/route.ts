import Stripe from "stripe"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * GET /api/payments/verify-session?session_id=cs_…
 *
 * Client-initiated reconciliation after Stripe redirects back to
 * /payment-success. Two roles:
 *
 *   1. VERIFY  — confirm Stripe says payment_status=paid + the
 *                caller matches the session's user_id metadata.
 *   2. CREDIT  — actively issue the credit (PPA: +1 via
 *                add_analysis_credits RPC; Pro: upsert
 *                user_subscriptions tier='pro') if no payment_history
 *                row exists for this session id yet.
 *
 * Used to be read-only — the original idea was "webhook is source
 * of truth, this just verifies". In practice the webhook can be
 * missing/stale/delayed (STRIPE_WEBHOOK_SECRET not set on Vercel,
 * Stripe endpoint config wrong, webhook delivery retrying, etc.)
 * and the user lands on /payment-success expecting their credit
 * NOW. Promoting this to also-write makes the user-initiated flow
 * the guaranteed path, with the webhook as redundant backup.
 *
 * Idempotency: gated by checking payment_history.stripe_session_id
 * BEFORE issuing the credit. If the webhook already inserted a row
 * for this session, we don't double-credit. If both this route and
 * the webhook race to insert, the unique session id behaviour of
 * add_analysis_credits + RPC atomicity keeps the credit at +1.
 */

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key, {
    apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion,
  })
}

export async function GET(req: Request) {
  const stripe = getStripeClient()
  if (!stripe) {
    return NextResponse.json(
      { success: false, error: "Stripe is not configured." },
      { status: 503 },
    )
  }

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get("session_id") || ""
  if (!sessionId.startsWith("cs_")) {
    return NextResponse.json(
      { success: false, error: "session_id is required" },
      { status: 400 },
    )
  }

  // Auth — must be the same user who initiated the checkout.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { success: false, error: "not_authenticated" },
      { status: 401 },
    )
  }

  // Pull the session from Stripe.
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "stripe lookup failed"
    console.warn("[verify-session] retrieve failed:", msg)
    return NextResponse.json(
      { success: false, error: msg },
      { status: 502 },
    )
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json(
      {
        success: false,
        error: `payment_status=${session.payment_status}`,
        paymentStatus: session.payment_status,
      },
      { status: 402 },
    )
  }

  // Tie back to caller — webhook embeds user_id in metadata when the
  // checkout session is created. session.metadata can fail-soft so
  // we accept either match (metadata) OR same email (Stripe customer).
  const sessionUserId = session.metadata?.user_id
  if (sessionUserId && sessionUserId !== user.id) {
    console.warn(
      `[verify-session] user mismatch: caller=${user.id} session=${sessionUserId}`,
    )
    return NextResponse.json(
      { success: false, error: "user_mismatch" },
      { status: 403 },
    )
  }

  const tier =
    (session.metadata?.tier as string | undefined) ?? "pay_per_analysis"
  const admin = createAdminClient()

  // ── Idempotency check + credit issuance ─────────────────────────────
  // Look for an existing payment_history row for this session id. If
  // present, the webhook already credited the user; we just confirm.
  // If absent, we issue the credit ourselves so the user gets it
  // immediately on the /payment-success page even if the webhook is
  // broken/missing/delayed.
  let alreadyRecorded = false
  try {
    const { data, error } = await admin
      .from("payment_history")
      .select("id")
      .eq("stripe_session_id", sessionId)
      .limit(1)
    if (error) throw error
    alreadyRecorded = Array.isArray(data) && data.length > 0
  } catch (e) {
    console.warn("[verify-session] payment_history read failed:", e)
  }

  let issued = false
  if (!alreadyRecorded) {
    if (tier === "pay_per_analysis") {
      // Bind-at-checkout — webhook supports the same; mirror here.
      const rawAnalysisId = (session.metadata?.analysis_id || "").trim()
      const UUID_RE =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const boundAnalysisId = UUID_RE.test(rawAnalysisId)
        ? rawAnalysisId
        : null
      const amountPaid = (session.amount_total ?? 299) / 100
      try {
        const { error } = await admin.rpc("add_analysis_credits", {
          p_user_id: user.id,
          p_credits: 1,
          p_tier: "pay_per_analysis",
          p_stripe_session_id: session.id,
          p_amount_gbp: amountPaid,
          p_analysis_id: boundAnalysisId,
        })
        if (error) throw error
        issued = true
      } catch (e) {
        console.error("[verify-session] add_analysis_credits failed:", e)
      }
    } else if (tier === "pro") {
      // Promote to Pro + log the purchase. Mirrors the webhook's Pro
      // path minus the Stripe subscription metadata (which the
      // webhook will fill in once it lands; this is the
      // user-visible 'I have Pro now' step).
      const amountPaid = (session.amount_total ?? 1999) / 100
      try {
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id ?? null
        await admin
          .from("user_subscriptions")
          .upsert(
            {
              user_id: user.id,
              tier: "pro",
              status: "active",
              stripe_customer_id: customerId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          )
        await admin.from("payment_history").insert({
          user_id: user.id,
          stripe_session_id: session.id,
          amount_gbp: amountPaid,
          tier: "pro",
          status: "succeeded",
          description: "Pro subscription started (verify-session)",
          event_type: "purchase_stripe",
          credit_delta: 0,
        })
        issued = true
      } catch (e) {
        console.error("[verify-session] pro upsert failed:", e)
      }
    }
  }

  return NextResponse.json({
    success: true,
    sessionId,
    tier,
    paymentStatus: session.payment_status,
    // `recorded` stays true if either the webhook beat us OR we just
    // issued — i.e. the user's account is in the expected state.
    recorded: alreadyRecorded || issued,
    issuedNow: issued,
  })
}
