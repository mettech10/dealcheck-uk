'use client'

import { type Paddle, initializePaddle } from '@paddle/paddle-js'

// Singleton — reset if the token changes between hot-reloads / deploys
let _paddle: Paddle | undefined
let _paddleToken: string | undefined

/**
 * Returns a singleton Paddle instance initialised for the correct environment.
 * Call this inside a useEffect or event handler (never at module-load time).
 *
 * ⚠️  RENDER / PRODUCTION NOTE:
 * NEXT_PUBLIC_* variables are baked into the JS bundle at BUILD time.
 * If you set them in the Render dashboard after a previous deploy, you MUST
 * trigger a new manual deploy so they get embedded into the new bundle.
 * Render Dashboard → Manual Deploy → Deploy latest commit
 */
export async function getPaddle(): Promise<Paddle | undefined> {
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN

  if (!token) {
    console.warn(
      '[Paddle] NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is not set. ' +
      'If you just added it to Render, trigger a new deploy — ' +
      'NEXT_PUBLIC_ vars are baked into the bundle at build time.'
    )
    return undefined
  }

  // Return cached instance only if the token hasn't changed
  if (_paddle && _paddleToken === token) return _paddle

  // Reset stale singleton (e.g. after a new deploy / hot-reload changes token)
  _paddle = undefined
  _paddleToken = token

  const env = process.env.NEXT_PUBLIC_PADDLE_ENV === 'production'
    ? 'production'
    : 'sandbox'

  _paddle = await initializePaddle({
    environment: env,
    token,
    checkout: {
      settings: {
        displayMode: 'overlay',
        theme: 'dark',
        locale: 'en-GB',
        successUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/analyse?payment=success`,
      },
    },
  })

  return _paddle
}

/** Open the Paddle checkout overlay for a given price ID */
export async function openCheckout(priceId: string, email?: string) {
  const paddle = await getPaddle()
  if (!paddle) {
    console.error('[Paddle] Could not initialise Paddle — check your client token.')
    return
  }

  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: email ? { email } : undefined,
  })
}
