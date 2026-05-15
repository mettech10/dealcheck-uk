/**
 * Single source of truth for Metalyzi subscription tiers.
 *
 * Consumed by:
 *  - components/landing/pricing.tsx   (marketing pricing section)
 *  - app/pricing/page.tsx              (dedicated /pricing route)
 *  - app/account/page.tsx              (user-facing tier + usage display)
 *  - lib/usageGate.ts                   (server-side tier enforcement)
 *  - app/api/payments/checkout/route.ts (maps tier id → Stripe price + mode)
 *  - lib/paymentEmails.ts               (tier-specific email templates)
 *
 * The four tiers:
 *  - free               → 3 analyses / month, BTL + HMO only, no PDF, no AI area
 *  - pay_per_analysis   → £2.99 each (one-time), unlocks full feature set for 1 deal
 *  - pro                → £19.99 / month recurring, unlimited + all strategies
 *  - enterprise         → bespoke pricing (mailto: CTA)
 *
 * Free-tier monthly limit and reset behaviour are enforced by the
 * get_user_tier Supabase RPC + lib/usageGate.ts. The "limit reset 1st
 * of each month" comes from period_start = DATE_TRUNC('month', NOW()).
 */

export type TierId = "free" | "pay_per_analysis" | "pro" | "enterprise"

export interface TierFeature {
  text: string
  /** When true, render as a locked/grey item — used on Free tier to surface
   *  what the user is missing without bloating the list. */
  locked?: boolean
}

export interface Tier {
  id: TierId
  name: string
  description: string
  /** Numeric price for Stripe-backed tiers. Omitted for enterprise. */
  price?: string
  period?: string
  /** Custom price display string (overrides price + period); used by
   *  enterprise ("Custom pricing"). */
  priceLabel?: string
  cta: string
  href?: string
  highlighted?: boolean
  badge?: string
  features: TierFeature[]
  footnote?: string
  /** Free tier: hard cap on analyses per calendar month. */
  freeAnalysesPerMonth?: number
  /** Strategies unlocked at this tier. */
  strategies: ReadonlyArray<"btl" | "hmo" | "brr" | "flip" | "r2sa" | "development">
  /** Feature flags evaluated by usage gate / UI. */
  unlocks: {
    aiAreaAnalysis: boolean
    pdfExport: boolean
    marketComparables: boolean
    spareroomListings: boolean
    airroiSaData: boolean
    sensitivityAnalysis: boolean
    fiveYearProjection: boolean
    regionalBenchmarks: boolean
  }
}

/** Free tier — every signed-up user starts here. */
const FREE: Tier = {
  id: "free",
  name: "Free",
  description: "Try the analyser with basic financials",
  price: "0",
  period: "forever",
  cta: "Get Started Free",
  href: "/analyse",
  freeAnalysesPerMonth: 3,
  strategies: ["btl", "hmo"],
  unlocks: {
    aiAreaAnalysis: false,
    pdfExport: false,
    marketComparables: false,
    spareroomListings: false,
    airroiSaData: false,
    sensitivityAnalysis: false,
    fiveYearProjection: false,
    regionalBenchmarks: false,
  },
  features: [
    { text: "3 deal analyses per month" },
    { text: "BTL and HMO strategies only" },
    { text: "SDLT calculator" },
    { text: "Gross & net yield" },
    { text: "Monthly cashflow" },
    { text: "Deal score" },
    { text: "AI area analysis", locked: true },
    { text: "PDF report export", locked: true },
    { text: "Market comparables", locked: true },
  ],
  footnote: "Resets on the 1st of each month",
}

const PAY_PER_ANALYSIS: Tier = {
  id: "pay_per_analysis",
  name: "Pay Per Analysis",
  description: "One full analysis, no monthly commitment",
  price: "2.99",
  period: "per analysis",
  cta: "Buy 1 Analysis",
  badge: "No subscription",
  strategies: ["btl", "hmo", "brr", "flip", "r2sa", "development"],
  unlocks: {
    aiAreaAnalysis: true,
    pdfExport: true,
    marketComparables: true,
    spareroomListings: true,
    airroiSaData: true,
    sensitivityAnalysis: true,
    fiveYearProjection: true,
    regionalBenchmarks: true,
  },
  features: [
    { text: "All 6 investment strategies" },
    { text: "Full AI-powered insights" },
    { text: "Market comparables with photos" },
    { text: "SpareRoom room listings (HMO)" },
    { text: "Airroi SA market data" },
    { text: "Article 4 check" },
    { text: "PDF report export" },
    { text: "AI area analysis" },
    { text: "Sensitivity analysis" },
    { text: "5-year projections" },
    { text: "Live regional benchmarks" },
  ],
  footnote: "One-off · unlocks the full feature set for a single deal",
}

const PRO: Tier = {
  id: "pro",
  name: "Pro",
  description: "Unlimited analyses for serious investors",
  price: "19.99",
  period: "per month",
  cta: "Go Pro",
  highlighted: true,
  strategies: ["btl", "hmo", "brr", "flip", "r2sa", "development"],
  unlocks: {
    aiAreaAnalysis: true,
    pdfExport: true,
    marketComparables: true,
    spareroomListings: true,
    airroiSaData: true,
    sensitivityAnalysis: true,
    fiveYearProjection: true,
    regionalBenchmarks: true,
  },
  features: [
    { text: "Everything in Pay Per Analysis" },
    { text: "Unlimited deal analyses" },
    { text: "Saved deals history (unlimited)" },
    { text: "Deal comparison tool" },
    { text: "BRRRR, Flip, SA, Development" },
    { text: "Priority support" },
    { text: "Early access to new features" },
  ],
  footnote: "Billed monthly · cancel anytime",
}

const ENTERPRISE: Tier = {
  id: "enterprise",
  name: "Enterprise",
  description: "Teams, white-label, custom integrations",
  priceLabel: "Custom pricing",
  cta: "Contact Us",
  strategies: ["btl", "hmo", "brr", "flip", "r2sa", "development"],
  unlocks: {
    aiAreaAnalysis: true,
    pdfExport: true,
    marketComparables: true,
    spareroomListings: true,
    airroiSaData: true,
    sensitivityAnalysis: true,
    fiveYearProjection: true,
    regionalBenchmarks: true,
  },
  features: [
    { text: "Everything in Pro" },
    { text: "Team seats" },
    { text: "API access" },
    { text: "White-label reports" },
    { text: "Custom integrations" },
    { text: "Dedicated account manager" },
    { text: "Volume pricing" },
  ],
  footnote: "Quote within 24 hours",
}

export const TIERS = [FREE, PAY_PER_ANALYSIS, PRO, ENTERPRISE] as const

export const TIERS_BY_ID: Record<TierId, Tier> = {
  free: FREE,
  pay_per_analysis: PAY_PER_ANALYSIS,
  pro: PRO,
  enterprise: ENTERPRISE,
}

/** Server-side tier-from-string normaliser. Falls through to free. */
export function tierFromId(raw: string | null | undefined): Tier {
  if (!raw) return FREE
  return TIERS_BY_ID[raw as TierId] ?? FREE
}

/** Helper for UI gates — does a strategy require an upgrade for this tier? */
export function strategyRequiresUpgrade(tierId: TierId, strategy: string): boolean {
  const tier = TIERS_BY_ID[tierId] ?? FREE
  return !tier.strategies.includes(strategy as Tier["strategies"][number])
}

/** Display label for free-tier monthly cap. */
export const FREE_MONTHLY_CAP = FREE.freeAnalysesPerMonth ?? 3
