/**
 * Stripe Checkout Session Handler
 *
 * Creates a Stripe-hosted checkout session and redirects the user.
 *
 * Required env vars (set in Vercel):
 *   STRIPE_SECRET_KEY  — from Stripe Dashboard → Developers → API keys
 */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const priceId = searchParams.get('priceId')
  const email   = searchParams.get('email') ?? undefined

  if (!priceId) {
    return Response.json({ error: 'priceId is required' }, { status: 400 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return Response.json({ error: 'Stripe is not configured' }, { status: 500 })
  }

  const origin = req.headers.get('origin') ?? 'https://metalyzi.co.uk'

  const body = new URLSearchParams({
    'mode': 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'success_url': `${origin}/analyse?payment=success`,
    'cancel_url': `${origin}/#pricing`,
  })
  if (email) body.set('customer_email', email)

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.json()
    console.error('[Stripe] Checkout session error:', err)
    return Response.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }

  const session = await res.json()
  return Response.redirect(session.url, 303)
}
