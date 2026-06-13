import Stripe from "stripe"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  sendPaymentConfirmationEmail,
  sendSubscriptionWelcomeEmail,
  sendRenewalConfirmationEmail,
  sendPaymentFailedEmail,
  sendCancellationEmail,
  sendOwnerPaymentNotification,
} from "@/lib/paymentEmails"
import { logAdminActivity } from "@/lib/admin-logs"

/**
 * POST /api/payments/webhook
 *
 * Stripe webhook receiver. Verifies the signature, then processes the
 * subset of events we care about for tier + usage state:
 *
 *   checkout.session.completed
 *     PPA → add 1 credit + welcome receipt
 *     Pro → set tier=pro, set Stripe sub id + period, welcome email
 *
 *   invoice.payment_succeeded
 *     Recurring Pro charge → roll forward current_period_end, reset
 *     status to active, send renewal receipt
 *
 *   invoice.payment_failed
 *     Mark sub past_due, send "update payment" email
 *
 *   customer.subscription.updated
 *     Picks up cancel-at-period-end toggles, plan changes, status flips
 *
 *   customer.subscription.deleted
 *     Final cancellation → downgrade to free, send cancel email
 *
 * Email sends are fire-and-forget inside try/catch so a Brevo outage
 * NEVER causes us to return non-2xx (which would make Stripe retry the
 * webhook and produce duplicate credits/state changes).
 *
 * Required env:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *
 * Idempotency: Stripe assigns each event a unique id; we use that to
 * dedupe via payment_history's stripe_session_id / stripe_invoice_id
 * indices (a duplicate webhook firing would upsert into the same row).
 */

// Required for raw-body access in Next.js App Router
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key, { apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion })
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getUserEmailFromAuth(userId: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error) {
      console.warn("[webhook] auth.admin.getUserById failed:", error.message)
      return null
    }
    return data.user?.email ?? null
  } catch (e) {
    console.warn("[webhook] getUserEmailFromAuth threw:", e)
    return null
  }
}

async function findUserBySubscriptionLink(opts: {
  customerId?: string | null
  subscriptionId?: string | null
}): Promise<string | null> {
  const admin = createAdminClient()
  let query = admin.from("user_subscriptions").select("user_id").limit(1)
  if (opts.subscriptionId) {
    query = query.eq("stripe_subscription_id", opts.subscriptionId)
  } else if (opts.customerId) {
    query = query.eq("stripe_customer_id", opts.customerId)
  } else {
    return null
  }
  const { data } = await query.maybeSingle()
  return data?.user_id ?? null
}

// ── Event handlers ─────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id
  const tier = session.metadata?.tier
  if (!userId || !tier) {
    console.warn("[webhook] checkout.session.completed missing user_id/tier metadata", {
      sessionId: session.id,
    })
    return
  }
  const admin = createAdminClient()

  // Idempotency: Stripe retries failed webhooks for up to 3 days. If
  // we've already processed this session id (manual retroactive grant,
  // or a prior successful run), skip silently — don't double-credit
  // the user. The docstring above always CLAIMED we deduped here but
  // the actual check was missing until 2026-05-30.
  {
    const { data: existing } = await admin
      .from("payment_history")
      .select("id")
      .eq("stripe_session_id", session.id)
      .limit(1)
      .maybeSingle()
    if (existing?.id) {
      console.warn("[webhook] checkout.session.completed already processed", {
        sessionId: session.id,
        existingRowId: existing.id,
      })
      return
    }
  }
  const email = (session.customer_details?.email
    ?? session.customer_email
    ?? (await getUserEmailFromAuth(userId)))
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null
  const stripeSubId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null

  if (tier === "pay_per_analysis") {
    // Optional bind-at-checkout: when the frontend knew the
    // saved-analysis id at click time it lands here as metadata
    // and the RPC stores it on payment_history.analysis_id
    // immediately. Empty / missing → floating credit (the
    // consume RPC binds it on first Save / PDF click).
    const rawAnalysisId = (session.metadata?.analysis_id || "").trim()
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const boundAnalysisId = UUID_RE.test(rawAnalysisId) ? rawAnalysisId : null

    // +1 credit + payment_history entry (bound or floating) — atomic in the RPC.
    const { error } = await admin.rpc("add_analysis_credits", {
      p_user_id: userId,
      p_credits: 1,
      p_tier: "pay_per_analysis",
      p_stripe_session_id: session.id,
      p_amount_gbp: 2.99,
      p_analysis_id: boundAnalysisId,
    })
    if (error) {
      // Critical: re-throw so the outer handler returns 5xx and Stripe
      // RETRIES this event. Without this we'd ack 200 OK while the
      // user's money is in Stripe and the credit was never granted —
      // exactly the bug that bit us 2026-05-29 (missing analysis_id
      // column made the RPC fail silently for every PPA purchase).
      console.error("[webhook] add_analysis_credits RPC failed:", error)
      throw new Error(`add_analysis_credits failed: ${error.message ?? "unknown"}`)
    }
    // Stash the Stripe customer id for future billing-portal links + reuse.
    if (stripeCustomerId) {
      await admin
        .from("user_subscriptions")
        .update({ stripe_customer_id: stripeCustomerId, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
    }
    if (email) {
      try {
        await sendPaymentConfirmationEmail({
          userEmail: email,
          amount: 2.99,
          sessionId: session.id,
        })
      } catch (e) {
        console.warn("[webhook] PPA confirmation email failed:", e)
      }
      // Owner / ops notification — separate try so a failed user
      // confirmation doesn't suppress the owner email.
      try {
        await sendOwnerPaymentNotification({
          kind: "ppa_purchase",
          amountGbp: 2.99,
          userEmail: email,
          userId,
          stripeSessionId: session.id,
        })
      } catch (e) {
        console.warn("[webhook] PPA owner notification failed:", e)
      }
    }
    // Admin activity feed — fire-and-forget.
    logAdminActivity({
      eventType: "payment",
      userId,
      userEmail: email ?? null,
      metadata: {
        tier: "pay_per_analysis",
        amount_gbp: 2.99,
        stripe_session_id: session.id,
        bind_analysis_id: boundAnalysisId,
      },
    }).catch(() => {})
    return
  }

  if (tier === "pro") {
    // Upsert subscription row, fetch live Stripe sub for period dates.
    let periodStart: Date | null = null
    let periodEnd: Date | null = null
    if (stripeSubId) {
      try {
        const stripe = getStripeClient()
        if (stripe) {
          const sub = await stripe.subscriptions.retrieve(stripeSubId)
          // Pull period dates from the first item — these live there in
          // recent Stripe API versions, not at the top level.
          const item0 = sub.items?.data?.[0] as
            | (Stripe.SubscriptionItem & {
                current_period_start?: number
                current_period_end?: number
              })
            | undefined
          if (item0?.current_period_start) {
            periodStart = new Date(item0.current_period_start * 1000)
          }
          if (item0?.current_period_end) {
            periodEnd = new Date(item0.current_period_end * 1000)
          }
        }
      } catch (e) {
        console.warn("[webhook] failed to retrieve subscription for period dates:", e)
      }
    }
    const { error } = await admin
      .from("user_subscriptions")
      .upsert(
        {
          user_id: userId,
          tier: "pro",
          status: "active",
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubId,
          current_period_start: periodStart?.toISOString() ?? null,
          current_period_end: periodEnd?.toISOString() ?? null,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
    if (error) console.error("[webhook] user_subscriptions upsert (pro) failed:", error)

    // Log the initial charge in payment_history.
    const amountPaid = (session.amount_total ?? 0) / 100
    await admin.from("payment_history").insert({
      user_id: userId,
      stripe_session_id: session.id,
      amount_gbp: amountPaid > 0 ? amountPaid : 19.99,
      tier: "pro",
      status: "succeeded",
      description: "Pro subscription started",
      // Pro is unlimited, not credit-based — 0 keeps credit audit sums honest.
      credit_delta: 0,
    })

    if (email) {
      try {
        await sendSubscriptionWelcomeEmail({ userEmail: email })
      } catch (e) {
        console.warn("[webhook] Pro welcome email failed:", e)
      }
      try {
        await sendOwnerPaymentNotification({
          kind: "pro_start",
          amountGbp: amountPaid > 0 ? amountPaid : 19.99,
          userEmail: email,
          userId,
          stripeSessionId: session.id,
          stripeSubscriptionId: stripeSubId,
        })
      } catch (e) {
        console.warn("[webhook] Pro owner notification failed:", e)
      }
    }
    // Admin activity feed — fire-and-forget.
    logAdminActivity({
      eventType: "payment",
      userId,
      userEmail: email ?? null,
      metadata: {
        tier: "pro",
        amount_gbp: amountPaid > 0 ? amountPaid : 19.99,
        stripe_session_id: session.id,
        stripe_subscription_id: stripeSubId,
      },
    }).catch(() => {})
    return
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // Recurring renewals only — initial sub starts also fire this event,
  // but checkout.session.completed handles those (this just refreshes
  // the period_end). Use the invoice line's period.end.
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null
  // Stripe Invoice has subscription_details.subscription in recent API versions;
  // fall back to first line item's subscription id.
  const subscriptionId =
    (invoice as unknown as { subscription?: string }).subscription
    ?? (invoice.lines?.data?.[0] as unknown as { subscription?: string })?.subscription
    ?? null
  const userId = await findUserBySubscriptionLink({ customerId, subscriptionId })
  if (!userId) {
    console.warn("[webhook] invoice.payment_succeeded — no user matched", {
      customerId,
      subscriptionId,
    })
    return
  }
  const admin = createAdminClient()

  // Idempotency: Stripe retries on any non-2xx/network blip. A repeat
  // delivery would duplicate the revenue row and re-send the renewal
  // email. The partial unique index on (stripe_invoice_id) WHERE
  // status='succeeded' backstops this check against races.
  {
    const { data: existing } = await admin
      .from("payment_history")
      .select("id")
      .eq("stripe_invoice_id", invoice.id)
      .eq("status", "succeeded")
      .limit(1)
      .maybeSingle()
    if (existing?.id) {
      console.warn("[webhook] invoice.payment_succeeded already processed", {
        invoiceId: invoice.id,
        existingRowId: existing.id,
      })
      return
    }
  }

  const line = invoice.lines.data[0]
  const periodEnd = line?.period?.end ? new Date(line.period.end * 1000) : null

  await admin
    .from("user_subscriptions")
    .update({
      status: "active",
      current_period_end: periodEnd?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)

  const amount = (invoice.amount_paid ?? 0) / 100
  const { error: invoiceInsertError } = await admin.from("payment_history").insert({
    user_id: userId,
    stripe_invoice_id: invoice.id,
    amount_gbp: amount,
    tier: "pro",
    status: "succeeded",
    description: "Pro subscription renewed",
  })
  if (invoiceInsertError) {
    // 23505 = a concurrent retry won the insert race — already recorded.
    if (invoiceInsertError.code === "23505") return
    console.error("[webhook] renewal payment_history insert failed:", invoiceInsertError)
  }

  const email = await getUserEmailFromAuth(userId)
  if (email && periodEnd && invoice.billing_reason === "subscription_cycle") {
    // Only send the renewal email on actual cycle renewals — the very
    // first invoice (subscription_create) is covered by the welcome
    // email already sent from checkout.session.completed.
    try {
      await sendRenewalConfirmationEmail({
        userEmail: email,
        amount,
        nextBillingDate: periodEnd,
      })
    } catch (e) {
      console.warn("[webhook] renewal email failed:", e)
    }
    try {
      await sendOwnerPaymentNotification({
        kind: "pro_renewal",
        amountGbp: amount,
        userEmail: email,
        userId,
        stripeSessionId: null,
        stripeSubscriptionId: subscriptionId,
      })
    } catch (e) {
      console.warn("[webhook] renewal owner notification failed:", e)
    }
  }
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null
  const subscriptionId =
    (invoice as unknown as { subscription?: string }).subscription
    ?? (invoice.lines?.data?.[0] as unknown as { subscription?: string })?.subscription
    ?? null
  const userId = await findUserBySubscriptionLink({ customerId, subscriptionId })
  if (!userId) return
  const admin = createAdminClient()
  await admin
    .from("user_subscriptions")
    .update({ status: "past_due", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
  await admin.from("payment_history").insert({
    user_id: userId,
    stripe_invoice_id: invoice.id,
    amount_gbp: (invoice.amount_due ?? 0) / 100,
    tier: "pro",
    status: "failed",
    description: "Pro renewal payment failed",
  })
  const email = await getUserEmailFromAuth(userId)
  if (email) {
    try {
      await sendPaymentFailedEmail({ userEmail: email })
    } catch (e) {
      console.warn("[webhook] payment failed email failed:", e)
    }
    try {
      await sendOwnerPaymentNotification({
        kind: "pro_failed",
        amountGbp: (invoice.amount_due ?? 0) / 100,
        userEmail: email,
        userId,
        stripeSessionId: null,
        stripeSubscriptionId: subscriptionId,
        note: "Card declined / insufficient funds / expired card — user may lose access if not resolved.",
      })
    } catch (e) {
      console.warn("[webhook] failed-payment owner notification failed:", e)
    }
  }
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id
  const userId = await findUserBySubscriptionLink({
    customerId,
    subscriptionId: sub.id,
  })
  if (!userId) return
  const admin = createAdminClient()
  // Period dates live on the first item in recent API versions.
  const item0 = sub.items?.data?.[0] as
    | (Stripe.SubscriptionItem & {
        current_period_start?: number
        current_period_end?: number
      })
    | undefined
  await admin
    .from("user_subscriptions")
    .update({
      status: sub.status,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      current_period_start: item0?.current_period_start
        ? new Date(item0.current_period_start * 1000).toISOString()
        : null,
      current_period_end: item0?.current_period_end
        ? new Date(item0.current_period_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id
  const userId = await findUserBySubscriptionLink({
    customerId,
    subscriptionId: sub.id,
  })
  if (!userId) return
  const admin = createAdminClient()
  await admin
    .from("user_subscriptions")
    .update({
      tier: "free",
      status: "cancelled",
      stripe_subscription_id: null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)

  // Log the cancellation as a credit event so it shows up in the
  // user's Credit History card. credit_delta=0 because Pro is
  // unlimited not credit-based — the row exists for the audit
  // trail. event_type='pro_cancelled' is the gate.
  await admin.from("payment_history").insert({
    user_id: userId,
    amount_gbp: 0,
    tier: "pro",
    status: "cancelled",
    description: "Pro subscription cancelled",
    event_type: "pro_cancelled",
    credit_delta: 0,
  })

  const email = await getUserEmailFromAuth(userId)
  if (email) {
    try {
      await sendCancellationEmail({ userEmail: email })
    } catch (e) {
      console.warn("[webhook] cancellation email failed:", e)
    }
  }
}

// ── Entry point ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const stripe = getStripeClient()
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured. Set STRIPE_SECRET_KEY." },
      { status: 503 },
    )
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    // Log loudly — silent 503s are the most common cause of "Stripe
    // webhook fires but nothing happens" reports.
    console.error(
      "[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set — every event will 503. " +
        "Set the secret in Vercel env vars and redeploy.",
    )
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 503 },
    )
  }

  const signature = req.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 })
  }

  const bodyText = await req.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(bodyText, signature, secret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bad signature"
    console.warn("[webhook] signature verification failed:", msg)
    return NextResponse.json({ error: "Webhook signature failed" }, { status: 400 })
  }

  // Top-of-handler logging used to fire here for every event — noisy
  // in production. Error paths below still log via console.error,
  // which is enough to trace handler crashes from Vercel logs.
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      case "invoice.payment_succeeded":
        await handleInvoicePaid(event.data.object as Stripe.Invoice)
        break
      case "invoice.payment_failed":
        await handleInvoiceFailed(event.data.object as Stripe.Invoice)
        break
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      default:
        // Stripe sends a lot of event types we don't care about
        // (payment_intent.created, customer.created, etc.). Acknowledge
        // them silently rather than 4xx-ing — keeps the dashboard clean.
        break
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "handler threw"
    console.error("[webhook] handler error:", msg, { eventType: event.type, id: event.id })
    // Return 500 → Stripe will retry. Only return 200 if we successfully
    // processed (or knowingly chose to skip) the event.
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
