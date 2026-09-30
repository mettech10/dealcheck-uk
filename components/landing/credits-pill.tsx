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
import { useCredits } from "@/lib/useCredits"
export { CREDITS_REFRESH_EVENT, type CreditsRefreshDetail } from "@/lib/credits-store"
import { Sparkles, Zap } from "lucide-react"

export function CreditsPill() {
  const state = useCredits()

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

  // Everyone else: free + PPA folded into a single "credits" counter.
  // Free monthly allowance is treated like credits (counted down rather
  // than counted up against the limit), so the user sees one number
  // they understand instead of two pools they have to mentally add.
  // Same teal pill style across all balance values for consistency —
  // 0 doesn't get an amber treatment because the inline blocked-state
  // banner on /analyse already covers that messaging.
  const freeLeft = Math.max(0, state.freeLimit - state.freeUsed)
  const totalCredits = freeLeft + Math.max(0, state.creditBalance)
  return (
    <Link
      href={state.authenticated ? "/account#credits" : "/pricing"}
      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/60"
      title={`${totalCredits} analysis credit${totalCredits === 1 ? "" : "s"} remaining`}
    >
      <Zap className="size-3 text-primary" />
      {totalCredits} credit{totalCredits === 1 ? "" : "s"}
    </Link>
  )
}
