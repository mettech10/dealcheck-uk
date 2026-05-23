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
    // Capture the page the user came from so the success_url can carry
    // it back. If Supabase ever bounces the user through /login on the
    // return trip (session expiry, etc.) the login page reads
    // returnTo and we still end up on the right page.
    const returnTo =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : ""

    const res = await fetch("/api/payments/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier, returnTo }),
    })

    if (res.status === 401) {
      // Anonymous → bounce to login, preserve where they were.
      const target = returnTo || "/pricing"
      window.location.href = `/login?returnTo=${encodeURIComponent(target)}`
      return
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string }
      console.error(
        "[Stripe] Checkout session creation failed:",
        res.status,
        err,
      )
      // Surface the actual reason so the user can act / report it. The
      // backend returns: 503 = Stripe not configured, 502 = Stripe API
      // error (e.g. invalid price id), 400 = bad tier.
      const reason = err?.error || `HTTP ${res.status}`
      if (res.status === 503) {
        alert(
          "Payments are not yet configured for this site. Please contact support.",
        )
      } else if (res.status === 502) {
        alert(
          `Stripe rejected the checkout request: ${reason}\n\nThis usually means a Stripe price id env var is missing or stale. Please contact support.`,
        )
      } else {
        alert(`Failed to start checkout: ${reason}`)
      }
      return
    }

    const { url } = (await res.json()) as { url?: string }
    if (url) {
      window.location.href = url
      return
    }
    console.error("[Stripe] Checkout session response missing url")
    alert("Failed to start checkout: server did not return a redirect URL.")
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
