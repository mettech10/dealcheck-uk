/**
 * Stripe checkout helper — client-side redirect to a hosted Stripe Checkout.
 *
 * Calls our internal /api/payments/checkout route which:
 *   - authenticates the user via Supabase cookies (401 if anonymous)
 *   - maps the tier id → Stripe price + mode (PPA = one-time, Pro = sub)
 *   - creates / reuses a Stripe customer per user
 *   - threads the user_id into session metadata so the webhook can
 *     reconcile the eventual payment back to the right Supabase user
 *
 * Required env on the server side:
 *   STRIPE_SECRET_KEY
 *   NEXT_PUBLIC_STRIPE_PRICE_PAY_PER_DEAL  (recommended)
 *   NEXT_PUBLIC_STRIPE_PRICE_PRO            (recommended)
 *
 * Usage:
 *   import { openCheckout } from "@/lib/stripe"
 *   <button onClick={() => openCheckout("pay_per_analysis")}>Buy</button>
 *   <button onClick={() => openCheckout("pro")}>Go Pro</button>
 */

import type { TierId } from "@/lib/tiers"

export async function openCheckout(tier: Extract<TierId, "pay_per_analysis" | "pro">) {
  try {
    const res = await fetch("/api/payments/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    })

    if (res.status === 401) {
      // Anonymous → bounce to login with a return-to redirect.
      window.location.href = `/login?redirect=${encodeURIComponent("/pricing")}`
      return
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error("[Stripe] Checkout session creation failed:", err)
      alert("Failed to start checkout. Please try again.")
      return
    }

    const { url } = await res.json()
    if (url) {
      window.location.href = url
    }
  } catch (err) {
    console.error("[Stripe] Network error during checkout:", err)
    alert("Failed to start checkout. Please check your connection and try again.")
  }
}

/**
 * Legacy adapter — old call sites that passed (priceId, mode) directly.
 * Translates the mode flag back to a tier id and forwards to openCheckout.
 * Kept so the pricing component's existing API survives the migration; new
 * code should call openCheckout(tier) directly.
 */
export async function openStripeCheckout(
  _priceId: string,
  mode: "payment" | "subscription",
  _email?: string,
) {
  const tier = mode === "subscription" ? "pro" : "pay_per_analysis"
  return openCheckout(tier)
}
