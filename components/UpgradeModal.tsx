"use client"

import { useEffect, useState } from "react"
import { X, Lock, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { openCheckout } from "@/lib/stripe"
import { FREE_MONTHLY_CAP } from "@/lib/tiers"

/**
 * UpgradeModal — shown when a user hits a paywall.
 *
 * Two reasons, two messages:
 *   - free_limit_reached → "You've used 3/3 free analyses this month"
 *   - no_credits         → "Out of analysis credits"
 *
 * Both variants offer the same two upgrade paths: PPA (£2.99 one-off)
 * and Pro (£19.99/month). Pro is highlighted as best value.
 *
 * Driven by parent component state — pass `open`, `reason`, and
 * `onClose`. Stripe redirects happen inside the modal (no parent
 * navigation needed); the cancel button just closes the modal.
 */

export type UpgradeReason =
  | "free_limit_reached"
  | "no_credits"
  | "not_logged_in"
  | "save_deal_locked"
  | "pdf_locked"
  | "analyse_locked"

interface UpgradeModalProps {
  open: boolean
  reason: UpgradeReason
  freeUsed?: number
  onClose: () => void
}

export function UpgradeModal({
  open,
  reason,
  freeUsed = 0,
  onClose,
}: UpgradeModalProps) {
  const [busy, setBusy] = useState<"pay_per_analysis" | "pro" | null>(null)

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  // Anonymous → send to login first
  if (reason === "not_logged_in") {
    return (
      <ModalShell onClose={onClose}>
        <Header
          icon={<Lock className="size-5 text-amber-500" />}
          title="Sign in to analyse deals"
        />
        <p className="text-sm text-muted-foreground">
          Create a free account to run 3 deal analyses per month. No card
          required.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            className="w-full"
            onClick={() => {
              window.location.href = `/login?redirect=${encodeURIComponent("/analyse")}`
            }}
          >
            Sign in
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Maybe later
          </Button>
        </div>
      </ModalShell>
    )
  }

  const isFreeExhausted = reason === "free_limit_reached"
  const isSaveLocked = reason === "save_deal_locked"
  const isPdfLocked = reason === "pdf_locked"
  const isAnalyseLocked = reason === "analyse_locked"
  const title = isAnalyseLocked
    ? "Continue analysing this deal"
    : isFreeExhausted
    ? "Free analyses used"
    : isSaveLocked
    ? "Save this deal"
    : isPdfLocked
    ? "Export PDF report"
    : "No credits remaining"
  const message = isAnalyseLocked
    ? "You've used your free analyses for this month. Choose Pay Per Analysis to run this one deal, or go Pro for unlimited analyses every month."
    : isFreeExhausted
    ? `You've used all ${FREE_MONTHLY_CAP} of your free analyses this month (${freeUsed}/${FREE_MONTHLY_CAP}). Upgrade to continue analysing deals.`
    : isSaveLocked
    ? "Saving deals to your history is available on Pay Per Analysis (£2.99) or Pro (£19.99/month). The analysis itself stays free — only the saved-deal storage is paid."
    : isPdfLocked
    ? "PDF report export is available on Pay Per Analysis (£2.99 for this deal) or Pro (£19.99/month, every deal)."
    : `You're out of Pay Per Analysis credits. Buy another one, or switch to Pro for unlimited analyses.`

  const onBuy = async (tier: "pay_per_analysis" | "pro") => {
    setBusy(tier)
    try {
      await openCheckout(tier)
    } finally {
      setBusy(null)
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <Header icon={<Lock className="size-5 text-amber-500" />} title={title} />
      <p className="text-sm text-muted-foreground">{message}</p>

      <div className="mt-6 flex flex-col gap-3">
        {/* PPA card */}
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Pay Per Analysis</div>
              <div className="text-xs text-muted-foreground">
                £2.99 per deal · no subscription
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => onBuy("pay_per_analysis")}
            >
              {busy === "pay_per_analysis" ? "…" : "Buy 1 Analysis →"}
            </Button>
          </div>
        </div>

        {/* Pro card */}
        <div className="rounded-lg border border-primary/50 bg-primary/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Best Value
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Pro</div>
              <div className="text-xs text-muted-foreground">
                £19.99/month · unlimited analyses · cancel anytime
              </div>
            </div>
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => onBuy("pro")}
            >
              {busy === "pro" ? "…" : "Go Pro →"}
            </Button>
          </div>
        </div>
      </div>

      <Button variant="ghost" className="mt-4 w-full" onClick={onClose}>
        Maybe later
      </Button>

      {isFreeExhausted && (
        <p className="mt-3 text-center text-[11px] text-muted-foreground/70">
          Free quota resets on the 1st of each month
        </p>
      )}
    </ModalShell>
  )
}

// ── Layout primitives ──────────────────────────────────────────────────────

function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
        {children}
      </div>
    </div>
  )
}

function Header({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    </div>
  )
}
