"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { openCheckout } from "@/lib/stripe"

/**
 * Client islands for the otherwise-server-rendered /account page.
 * Keeps the page static + fast while still allowing the two paid-flow
 * buttons to dispatch redirects.
 */

/** "Manage Subscription" → POST /api/payments/portal → Stripe Customer
 *  Portal. Used by Pro subscribers + anyone with a Stripe customer on
 *  file (so PPA users can view past invoices too). */
export function ManageSubscriptionButton() {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const res = await fetch("/api/payments/portal", { method: "POST" })
          const j = await res.json()
          if (j.url) {
            window.location.href = j.url
            return
          }
          alert(j.error ?? "Failed to open billing portal")
        } catch (e) {
          console.error("[account] portal failed:", e)
          alert("Failed to open billing portal")
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? "Opening…" : "Manage Subscription"}
    </Button>
  )
}

/** Buy-Pro + Buy-PPA buttons shown to Free / PPA users on /account. */
export function BuyUpgradeButtons() {
  const [busy, setBusy] = useState<"pay_per_analysis" | "pro" | null>(null)
  const buy = async (tier: "pay_per_analysis" | "pro") => {
    setBusy(tier)
    try {
      await openCheckout(tier)
    } finally {
      setBusy(null)
    }
  }
  return (
    <>
      <Button onClick={() => buy("pro")} disabled={busy !== null}>
        {busy === "pro" ? "…" : "Upgrade to Pro · £19.99/mo"}
      </Button>
      <Button
        variant="outline"
        onClick={() => buy("pay_per_analysis")}
        disabled={busy !== null}
      >
        {busy === "pay_per_analysis" ? "…" : "Buy 1 Analysis · £2.99"}
      </Button>
    </>
  )
}
