import Stripe from "stripe"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * GET /api/payments/verify-session?session_id=cs_…
 *
 * Client-initiated reconciliation after Stripe redirects back to
 * /analyse?payment=success. Webhook is the source of truth (it inserts
 * payment_history and bumps credits via add_analysis_credits); this
 * endpoint exists so the UI can confirm receipt without depending on
 * webhook latency, and so the success banner only renders for a
 * verified payment.
 *
 * What it does (idempotent — safe to call multiple times):
 *   1. Auth: must have a signed-in Supabase user (401 otherwise).
 *   2. Pull the session from Stripe.
 *   3. Reject if payment_status !== "paid".
 *   4. Reject if session.metadata.user_id doesn't match the caller —
 *      blocks one user from confirming another's payment.
 *   5. Read payment_history to see whether the webhook has already
 *      logged this session id. If yes → return { success: true, recorded: true }.
 *      If not yet → return { success: true, recorded: false } so the
 *      UI can show "processing — refresh in a moment" rather than
 *      claiming failure.
 *
 * Does NOT write to payment_history — that's the webhook's job. This
 * route is read-only verification.
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
  // checkout session is created.
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

  const tier = (session.metadata?.tier as string | undefined) ?? "pay_per_analysis"

  // Has the webhook already logged this payment? If not the UI can
  // still show a soft success (Stripe says paid) but flag that the
  // credit / email may take a moment.
  let recorded = false
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("payment_history")
      .select("id")
      .eq("stripe_session_id", sessionId)
      .limit(1)
    if (error) {
      console.warn("[verify-session] payment_history read failed:", error)
    } else {
      recorded = Array.isArray(data) && data.length > 0
    }
  } catch (e) {
    console.warn("[verify-session] payment_history threw:", e)
  }

  return NextResponse.json({
    success: true,
    sessionId,
    tier,
    paymentStatus: session.payment_status,
    recorded,
  })
}
