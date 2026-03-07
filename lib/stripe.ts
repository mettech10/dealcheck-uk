'use client'

/**
 * Opens a Stripe Checkout session for a given price ID.
 * Redirects to Stripe-hosted checkout page.
 *
 * Required env vars (set in Vercel):
 *   NEXT_PUBLIC_STRIPE_PRICE_PAY_PER_DEAL  — Stripe price ID (price_xxx)
 *   NEXT_PUBLIC_STRIPE_PRICE_PRO           — Stripe price ID (price_xxx)
 *   NEXT_PUBLIC_STRIPE_PRICE_UNLIMITED     — Stripe price ID (price_xxx)
 */
export async function openCheckout(priceId: string, email?: string) {
  const params = new URLSearchParams({ priceId })
  if (email) params.set('email', email)
  window.location.href = `/api/stripe/checkout?${params.toString()}`
}
