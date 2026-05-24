"use client"

/**
 * Credit gate banner — isolated client island shown above the analyse
 * form when the user is blocked or down to their last credit.
 *
 * Why this lives in its own file (not as a hook on the parent):
 *   Stage F (commit 4de38c2) added useCreditGate as a third React
 *   hook inside the AnalysePage component body, alongside the
 *   existing useUserPermissions + useAnalysisAccess. In production
 *   builds this combination tripped a TDZ ("Cannot access 'eb'
 *   before initialization") — almost certainly a webpack chunking
 *   interaction between the three similar fetch-on-mount hooks
 *   getting deduplicated / reordered at minification time. Isolating
 *   the fetch into its own component file with NO shared
 *   dependencies on the other hooks lets the bundler give it its
 *   own chunk and dodges whatever the collision was.
 *
 * The component is intentionally fetch-direct (no shared hook from
 * lib/useCreditGate) for the same reason. The cost is one extra
 * /api/user/credits request when the page also mounts the navbar
 * CreditsPill — cheap, and pricier than the alternative of bringing
 * back the bug.
 *
 * Renders nothing in the happy path (unlimited / 2+ credits). On
 * blocked state, the prominent amber block + Buy/Pro CTAs are the
 * primary user signal. Server-side 402 from /api/analyse still
 * catches anyone who submits anyway.
 */

import { useEffect, useState } from "react"
import Link from "next/link"

interface CreditState {
  authenticated: boolean
  tier: string
  isUnlimited: boolean
  creditBalance: number
  freeUsed: number
  freeLimit: number
  canAnalyse: boolean
}

export function CreditGateBanner() {
  const [state, setState] = useState<CreditState | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/user/credits")
      .then((r) => (r.ok ? (r.json() as Promise<CreditState>) : null))
      .then((d) => {
        if (!cancelled && d) setState(d)
      })
      .catch(() => {
        /* silent — banner just stays hidden if the fetch fails;
           server-side 402 is still the safety net */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Loading or unauth → render nothing. Anonymous users hit the
  // existing not-logged-in modal on submit, no need to pre-empt.
  if (!state || !state.authenticated) return null

  // Unlimited (Pro / Enterprise) → no message.
  if (state.isUnlimited) return null

  const blocked = !state.canAnalyse
  const oneLeft = state.creditBalance === 1
  if (!blocked && !oneLeft) return null

  if (blocked) {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
        <p className="font-medium">
          {state.tier === "free"
            ? `You've used your ${state.freeLimit} free analyses this month.`
            : "You're out of analysis credits."}{" "}
          Buy a credit (£2.99) or go Pro to continue.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
          >
            Buy 1 Analysis — £2.99
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 rounded-md border border-border/40 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-foreground/5"
          >
            Go Pro — £19.99/month
          </Link>
        </div>
      </div>
    )
  }

  // oneLeft path
  return (
    <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
      You have <strong>1</strong> analysis credit remaining.
    </div>
  )
}
