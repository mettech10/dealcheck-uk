/**
 * Stripe Webhook Handler
 *
 * Receives signed webhook events from Stripe and processes them.
 * Stripe docs: https://stripe.com/docs/webhooks
 *
 * Required env vars (set in Vercel):
 *   STRIPE_WEBHOOK_SECRET  — from Stripe Dashboard → Webhooks → signing secret (whsec_...)
 */

export async function POST(req: Request) {
  const body      = await req.text()
  const sigHeader = req.headers.get('stripe-signature') ?? ''
  const secret    = process.env.STRIPE_WEBHOOK_SECRET ?? ''

  // Verify Stripe signature (t=TIMESTAMP,v1=HMAC)
  if (secret) {
    const parts     = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')))
    const timestamp = parts['t']
    const v1        = parts['v1']

    if (!timestamp || !v1) {
      return Response.json({ error: 'Missing signature fields' }, { status: 400 })
    }

    const encoder  = new TextEncoder()
    const keyData  = encoder.encode(secret)
    const msgData  = encoder.encode(`${timestamp}.${body}`)
    const key      = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig      = await crypto.subtle.sign('HMAC', key, msgData)
    const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')

    if (expected !== v1) {
      return Response.json({ error: 'Invalid signature' }, { status: 400 })
    }
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(body)
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = event.type as string
  const data      = (event.data as Record<string, unknown>)?.object as Record<string, unknown>

  console.log(`[Stripe Webhook] Received: ${eventType}`)

  switch (eventType) {
    case 'customer.subscription.created':
      console.log('[Stripe] New subscription:', data?.id)
      // TODO: Mark user as subscribed in Supabase
      break

    case 'customer.subscription.updated':
      console.log('[Stripe] Subscription updated:', data?.id)
      break

    case 'customer.subscription.deleted':
      console.log('[Stripe] Subscription cancelled:', data?.id)
      // TODO: Revoke access in Supabase
      break

    case 'invoice.payment_succeeded':
      console.log('[Stripe] Payment succeeded:', data?.id)
      // TODO: Grant credits/access in Supabase
      break

    case 'invoice.payment_failed':
      console.log('[Stripe] Payment failed:', data?.id)
      break

    default:
      console.log(`[Stripe] Unhandled event type: ${eventType}`)
  }

  return Response.json({ received: true })
}
