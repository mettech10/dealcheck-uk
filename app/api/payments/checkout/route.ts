import Stripe from "stripe"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { TIERS_BY_ID, type TierId } from "@/lib/tiers"

/**
 * POST /api/payments/checkout
 *
 * Body: { tier: "pay_per_analysis" | "pro" }
 *
 * Creates a Stripe checkout session and returns { url } for the client to
 * redirect to. Authenticates via Supabase cookies — anonymous callers
 * get 401 (the upgrade modal redirects to /login first).
 *
 * Tier → mode + price mapping comes from TIERS_BY_ID and env-configured
 * Stripe price ids. If no Stripe price id is set for the tier we fall
 * back to inline `price_data` so checkout still works in dev/preview —
 * but in production these env vars MUST be set so Stripe's reporting +
 * lifecycle hooks tie the session back to a real Stripe product.
 *
 * Required env:
 *   STRIPE_SECRET_KEY
 *   NEXT_PUBLIC_SITE_URL                  (default: https://metalyzi.co.uk)
 *   NEXT_PUBLIC_STRIPE_PRICE_PAY_PER_DEAL (recommended)
 *   NEXT_PUBLIC_STRIPE_PRICE_PRO          (recommended)
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://metalyzi.co.uk"

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key, { apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion })
}

export async function POST(req: Request) {
  const stripe = getStripeClient()
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured. Set STRIPE_SECRET_KEY." },
      { status: 503 },
    )
  }

  // ── Authenticate ────────────────────────────────────────────────────
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const userId = user.id
  const userEmail = user.email ?? undefined

  // ── Validate tier ───────────────────────────────────────────────────
  let body: { tier?: string; returnTo?: string; analysisId?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* ignore — handled below */
  }
  const tierId = body.tier as TierId | undefined
  if (!tierId || (tierId !== "pay_per_analysis" && tierId !== "pro")) {
    return NextResponse.json(
      { error: "Body must include tier: 'pay_per_analysis' or 'pro'" },
      { status: 400 },
    )
  }
  const tier = TIERS_BY_ID[tierId]

  // Whitelisted return path — only relative paths (open-redirect guard).
  // Echoed into success_url so the post-payment page knows where to
  // send the user if /analyse needs to redirect them onward.
  const rawReturn = (body.returnTo || "").trim()
  const safeReturn =
    rawReturn.startsWith("/") && !rawReturn.startsWith("//") ? rawReturn : ""

  // Optional bind-at-checkout: when the frontend has a saved-analysis
  // id at click time (e.g. "Buy 1 Analysis" rendered on a deal that's
  // already persisted), we ride the id through Stripe metadata so the
  // webhook stores it on payment_history immediately. Pure UUIDv4
  // shape check — webhook validates against saved_analyses by FK.
  const rawAnalysisId = (body.analysisId || "").trim()
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const safeAnalysisId = UUID_RE.test(rawAnalysisId) ? rawAnalysisId : ""

  // ── Find or create Stripe customer ──────────────────────────────────
  // For Pro we want the same Stripe customer across renewals so invoices
  // and the billing portal hang off one record. For PPA we don't need
  // it but we still link by email so the same person sees a consistent
  // payment history.
  let customerId: string | undefined
  try {
    // Reuse existing customer record if we have one in user_subscriptions
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle()
    customerId = existing?.stripe_customer_id ?? undefined
    if (!customerId && userEmail) {
      const found = await stripe.customers.list({ email: userEmail, limit: 1 })
      customerId = found.data[0]?.id
    }
    if (!customerId && userEmail) {
      const created = await stripe.customers.create({
        email: userEmail,
        metadata: { user_id: userId },
      })
      customerId = created.id
    }
  } catch (e) {
    console.warn("[payments/checkout] customer lookup/create failed:", e)
    // Non-fatal — Stripe will create a guest customer at checkout.
  }

  // ── Build line item ─────────────────────────────────────────────────
  // Prefer the configured price id (lets Stripe reporting tie to the
  // canonical Product). Fall back to inline price_data with the
  // canonical amount from lib/tiers.ts so dev/preview environments work
  // without env config.
  const priceFromEnv =
    tierId === "pay_per_analysis"
      ? process.env.NEXT_PUBLIC_STRIPE_PRICE_PAY_PER_DEAL ?? process.env.STRIPE_PRICE_ID_PAY_PER_DEAL
      : process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO ?? process.env.STRIPE_PRICE_ID_PRO

  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = priceFromEnv
    ? { price: priceFromEnv, quantity: 1 }
    : {
        price_data: {
          currency: "gbp",
          product_data: {
            name: tierId === "pro" ? "Metalyzi Pro" : "Metalyzi Pay Per Analysis",
            description:
              tierId === "pro"
                ? "Unlimited deal analyses · all strategies · cancel anytime"
                : "One full property deal analysis · all strategies · AI insights · PDF export",
          },
          unit_amount: tierId === "pro" ? 1999 : 299,
          ...(tierId === "pro" ? { recurring: { interval: "month" as const } } : {}),
        },
        quantity: 1,
      }

  // ── Create checkout session ─────────────────────────────────────────
  try {
    const session = await stripe.checkout.sessions.create({
      mode: tierId === "pro" ? "subscription" : "payment",
      payment_method_types: ["card"],
      line_items: [lineItem],
      ...(customerId
        ? { customer: customerId }
        : userEmail
          ? { customer_email: userEmail }
          : {}),
      // Tier-specific identifiers carried on the session so the webhook
      // can route the event to the right code path AND reconcile back to
      // the right Supabase user without depending on email matching.
      metadata: {
        user_id: userId,
        tier: tier.id,
        // Empty string when not bind-at-checkout — webhook treats
        // both "" and missing as "floating credit".
        analysis_id: safeAnalysisId,
      },
      ...(tierId === "pro"
        ? {
            subscription_data: {
              metadata: { user_id: userId, tier: tier.id },
            },
          }
        : {}),
      success_url:
        tierId === "pro"
          ? `${SITE_URL}/account?upgraded=pro&session_id={CHECKOUT_SESSION_ID}`
          : safeReturn
            ? `${SITE_URL}/analyse?payment=success&session_id={CHECKOUT_SESSION_ID}&returnTo=${encodeURIComponent(safeReturn)}`
            : `${SITE_URL}/analyse?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: safeReturn
        ? `${SITE_URL}${safeReturn}${safeReturn.includes("?") ? "&" : "?"}payment=cancelled`
        : `${SITE_URL}/pricing?cancelled=true`,
      allow_promotion_codes: true,
    })

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL" },
        { status: 502 },
      )
    }
    return NextResponse.json({ url: session.url, id: session.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown stripe error"
    console.error("[payments/checkout] stripe.checkout.sessions.create failed:", msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
