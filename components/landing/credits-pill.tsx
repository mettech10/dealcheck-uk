"use client"

/**
 * Credits pill — always-visible balance indicator next to the
 * user avatar in the navbar.
 *
 * Three visual states (matched to the brief):
 *   - Pro / Enterprise  → teal "PRO" pill
 *   - PPA balance > 0   → grey "{N} credit(s)" pill
 *   - Free user         → amber "{used}/{limit} free" pill
 *
 * Self-contained — fetches /api/user/credits on mount, no parent
 * state required. Renders nothing while loading so the navbar
 * doesn't shift around. Clicking the pill scrolls /account to the
 * Credits card via the #credits anchor.
 *
 * Anonymous users get a coherent "0/3 free" shape from the API,
 * so we still show them the free counter — invites sign-up rather
 * than hiding.
 */

import Link from "next/link"
import { useEffect, useState } from "react"
import { Sparkles, Zap } from "lucide-react"

interface CreditsResponse {
  authenticated: boolean
  tier: string
  isUnlimited: boolean
  creditBalance: number
  freeUsed: number
  freeLimit: number
}

export function CreditsPill() {
  const [state, setState] = useState<CreditsResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/user/credits")
      .then((r) => (r.ok ? (r.json() as Promise<CreditsResponse>) : null))
      .then((d) => {
        if (!cancelled && d) setState(d)
      })
      .catch(() => {
        /* silent — pill just stays hidden */
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!state) return null

  // Pro / Enterprise — flat teal pill, no number.
  if (state.isUnlimited) {
    return (
      <Link
        href="/account#credits"
        className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary/25"
        title="Pro — unlimited analyses"
      >
        <Sparkles className="size-3" />
        Pro
      </Link>
    )
  }

  // PPA with credits — grey/neutral pill with the balance.
  if (state.creditBalance > 0) {
    return (
      <Link
        href="/account#credits"
        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/60"
        title={`${state.creditBalance} analysis credit${state.creditBalance === 1 ? "" : "s"} remaining`}
      >
        <Zap className="size-3 text-primary" />
        {state.creditBalance} credit{state.creditBalance === 1 ? "" : "s"}
      </Link>
    )
  }

  // Free tier (or anonymous) — amber counter.
  const left = Math.max(0, state.freeLimit - state.freeUsed)
  const exhausted = left <= 0
  return (
    <Link
      href={state.authenticated ? "/account#credits" : "/pricing"}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        exhausted
          ? "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
          : "border-amber-500/30 bg-amber-500/5 text-amber-200 hover:bg-amber-500/15"
      }`}
      title={
        exhausted
          ? "Free analyses used — upgrade to keep analysing"
          : `${left} free ${left === 1 ? "analysis" : "analyses"} left this month`
      }
    >
      {left}/{state.freeLimit} free
    </Link>
  )
}
