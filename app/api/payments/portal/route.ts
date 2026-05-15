import Stripe from "stripe"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/payments/portal
 *
 * Returns { url } for the Stripe Customer Portal so the user can manage
 * their payment method, cancel, view invoices, etc. Used by the
 * "Manage Subscription" button on /account.
 *
 * Auth + customer lookup: we read the current Supabase user and grab
 * their stripe_customer_id from user_subscriptions. If none is found
 * (e.g. a free-tier user clicks the button defensively), returns 400.
 */

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key, { apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion })
}

export async function POST() {
  const stripe = getStripeClient()
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: sub } = await admin
    .from("user_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle()
  const customerId = sub?.stripe_customer_id
  if (!customerId) {
    return NextResponse.json(
      { error: "No Stripe customer on file. Make a purchase first." },
      { status: 400 },
    )
  }

  const returnUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://metalyzi.co.uk"}/account`

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })
    return NextResponse.json({ url: session.url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "billing portal create failed"
    console.error("[payments/portal] create failed:", msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
