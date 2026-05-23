"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, ChevronDown, ChevronUp, Lock } from "lucide-react"
import { openStripeCheckout } from "@/lib/stripe"
import { TIERS } from "@/lib/tiers"

/** Number of feature rows shown before the "Show more" toggle kicks in.
 *  Picked to fit comfortably on one screen at typical laptop sizes
 *  without dwarfing the CTA. */
const COLLAPSED_FEATURES = 5

/**
 * Pricing — 4 tiers. Free / Pay Per Analysis / Pro / Enterprise.
 *
 * Tier metadata is canonical in lib/tiers.ts so the same definitions are
 * used by checkout routes, usage gates, account page and feature flags.
 * Keep this file presentation-only.
 *
 * Stripe price IDs come from env (NEXT_PUBLIC_STRIPE_PRICE_PAY_PER_DEAL,
 * NEXT_PUBLIC_STRIPE_PRICE_PRO). Enterprise has no Stripe price — it's a
 * mailto: contact CTA.
 */
export function Pricing() {
  return (
    <section id="pricing" className="py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Simple, Transparent Pricing
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Start free. Pay when you need a one-off. Subscribe when you go all-in.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <PricingCard key={tier.id} tier={tier} />
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Payments processed securely by{" "}
          <span className="font-medium text-foreground">Stripe</span>. Pro subscriptions cancellable anytime.
        </p>
      </div>
    </section>
  )
}

function PricingCard({ tier }: { tier: (typeof TIERS)[number] }) {
  return (
    <div
      className={`relative flex flex-col rounded-xl border p-6 ${
        tier.highlighted
          ? "border-primary/50 bg-primary/5 shadow-[0_0_30px_oklch(0.75_0.15_190_/_0.1)]"
          : "border-border/50 bg-card"
      }`}
    >
      {tier.highlighted && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
          Most Popular
        </Badge>
      )}
      {tier.badge && !tier.highlighted && (
        <Badge variant="outline" className="absolute -top-3 left-1/2 -translate-x-1/2 bg-card">
          {tier.badge}
        </Badge>
      )}

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
      </div>

      <div className="mb-6 min-h-[58px]">
        {tier.priceLabel ? (
          <span className="text-3xl font-bold text-foreground">{tier.priceLabel}</span>
        ) : (
          <>
            <span className="text-3xl font-bold text-foreground">£{tier.price}</span>
            <span className="text-sm text-muted-foreground">/{tier.period}</span>
          </>
        )}
      </div>

      <FeatureList features={tier.features} />

      <PricingCta tier={tier} />

      {tier.footnote && (
        <p className="mt-3 text-center text-[11px] text-muted-foreground/70">
          {tier.footnote}
        </p>
      )}
    </div>
  )
}

/** Collapsible feature list — shows the first COLLAPSED_FEATURES rows
 *  and reveals the rest behind a toggle. Cards with few features
 *  render the full list with no toggle (Pro, Enterprise, PPA are all
 *  well below the cap after the 2026-05 copy trim — only Free needs
 *  the toggle today, but the behaviour is per-card so any tier that
 *  grows past the cap stays compact automatically). */
function FeatureList({
  features,
}: {
  features: (typeof TIERS)[number]["features"]
}) {
  const [expanded, setExpanded] = useState(false)
  const overflowing = features.length > COLLAPSED_FEATURES
  const visible = expanded || !overflowing
    ? features
    : features.slice(0, COLLAPSED_FEATURES)
  const hiddenCount = features.length - COLLAPSED_FEATURES

  return (
    <div className="mb-8 flex flex-1 flex-col">
      <ul className="flex flex-col gap-3">
        {visible.map((feature) => (
          <li key={feature.text} className="flex items-start gap-2.5 text-sm">
            {feature.locked ? (
              <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
            ) : (
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            )}
            <span
              className={
                feature.locked
                  ? "text-muted-foreground/60"
                  : "text-muted-foreground"
              }
            >
              {feature.text}
            </span>
          </li>
        ))}
      </ul>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              Show less
              <ChevronUp className="size-3.5" />
            </>
          ) : (
            <>
              Show {hiddenCount} more
              <ChevronDown className="size-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  )
}

function PricingCta({ tier }: { tier: (typeof TIERS)[number] }) {
  // Free tier — direct nav to analyse
  if (tier.id === "free") {
    return (
      <Button
        asChild
        variant={tier.highlighted ? "default" : "outline"}
        className="w-full"
      >
        <Link href={tier.href ?? "/analyse"}>{tier.cta}</Link>
      </Button>
    )
  }

  // Enterprise — mailto: contact (no Stripe)
  if (tier.id === "enterprise") {
    return (
      <Button
        asChild
        variant={tier.highlighted ? "default" : "outline"}
        className="w-full"
      >
        <a
          href={`mailto:contact@metalyzi.co.uk?subject=${encodeURIComponent("Enterprise Enquiry — Metalyzi")}`}
        >
          {tier.cta}
        </a>
      </Button>
    )
  }

  // Stripe-backed tiers
  const priceId =
    tier.id === "pay_per_analysis"
      ? process.env.NEXT_PUBLIC_STRIPE_PRICE_PAY_PER_DEAL
      : tier.id === "pro"
        ? process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO
        : ""
  const mode = tier.id === "pro" ? "subscription" : "payment"

  return (
    <Button
      variant={tier.highlighted ? "default" : "outline"}
      className="w-full"
      onClick={() => {
        if (!priceId) {
          console.warn(
            `[Stripe] Price ID not configured for "${tier.id}". ` +
              `Set NEXT_PUBLIC_STRIPE_PRICE_${tier.id === "pro" ? "PRO" : "PAY_PER_DEAL"} in env.`
          )
          alert(`Payment for "${tier.name}" is not yet activated.`)
          return
        }
        openStripeCheckout(priceId, mode)
      }}
    >
      {tier.cta}
    </Button>
  )
}
