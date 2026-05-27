import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isAdminEmail } from "@/lib/admin"
import {
  sendPaymentConfirmationEmail,
  sendSubscriptionWelcomeEmail,
  sendOwnerPaymentNotification,
} from "@/lib/paymentEmails"

/**
 * GET /api/debug/test-payment-emails?kind=ppa|pro
 *
 * Admin-only. Fires the SAME email templates that real Stripe
 * webhook + verify-session would send, addressed to the calling
 * admin. Use this to verify Brevo is delivering + the owner-
 * notification mailbox is receiving, WITHOUT having to buy a real
 * test PPA / Pro subscription.
 *
 * Response includes pass/fail per email so you know whether Brevo
 * accepted each send. Brevo accepting !== inbox delivery — also
 * check the configured BREVO_SENDER_EMAIL's reputation +
 * OWNER_NOTIFICATION_EMAIL inbox.
 *
 * Three emails fired per call (mirrors prod):
 *   1. User confirmation (PPA or Pro template)
 *   2. Owner notification to OWNER_NOTIFICATION_EMAIL
 *      (defaults to contact@metalyzi.co.uk)
 *
 * Sends to the caller's signed-in admin email — does NOT touch
 * any real customer.
 */

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const kindRaw = (searchParams.get("kind") ?? "ppa").toLowerCase()
  const kind = kindRaw === "pro" ? "pro" : "ppa"

  const adminEmail = user!.email!
  const fakeSession = `cs_test_DEBUG_${Date.now()}`
  const amount = kind === "pro" ? 19.99 : 2.99

  const results: Record<string, { ok: boolean; error?: string }> = {}

  // 1. User confirmation
  try {
    const sent =
      kind === "pro"
        ? await sendSubscriptionWelcomeEmail({ userEmail: adminEmail })
        : await sendPaymentConfirmationEmail({
            userEmail: adminEmail,
            amount,
            sessionId: fakeSession,
          })
    results.user_confirmation = { ok: !!sent }
  } catch (e) {
    results.user_confirmation = {
      ok: false,
      error: e instanceof Error ? e.message : "unknown",
    }
  }

  // 2. Owner notification
  try {
    const sent = await sendOwnerPaymentNotification({
      kind: kind === "pro" ? "pro_start" : "ppa_purchase",
      amountGbp: amount,
      userEmail: adminEmail,
      userId: user!.id,
      stripeSessionId: fakeSession,
      note: "TEST EMAIL via /api/debug/test-payment-emails — not a real payment.",
    })
    results.owner_notification = { ok: !!sent }
  } catch (e) {
    results.owner_notification = {
      ok: false,
      error: e instanceof Error ? e.message : "unknown",
    }
  }

  const allOk = Object.values(results).every((r) => r.ok)
  return NextResponse.json({
    kind,
    sentTo: adminEmail,
    ownerRecipient:
      process.env.OWNER_NOTIFICATION_EMAIL ?? "contact@metalyzi.co.uk",
    fakeSessionId: fakeSession,
    results,
    overall: allOk ? "all_sent" : "partial_or_failed",
    note:
      "Brevo accepting !== inbox delivery. Check the recipient's spam folder if you don't see the email within 60s.",
  })
}
