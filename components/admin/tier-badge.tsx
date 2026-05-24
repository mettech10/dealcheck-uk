/**
 * Tier badge — colour-coded pill for a user's plan tier.
 *
 * Maps the four tier ids from lib/tiers.ts to brand-consistent
 * background/foreground colours at 20% opacity (per general styling
 * rules in the admin brief). Unknown tiers fall through to the
 * Free style so a typo doesn't break the table.
 */

import { cn } from "@/lib/utils"

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  pay_per_analysis: "PPA",
  pro: "Pro",
  enterprise: "Enterprise",
}

const TIER_STYLES: Record<string, string> = {
  free: "bg-[#9CA3AF]/20 text-[#9CA3AF]",
  pay_per_analysis: "bg-[#3B82F6]/20 text-[#60A5FA]",
  pro: "bg-[#00BFA5]/20 text-[#00BFA5]",
  enterprise: "bg-[#F59E0B]/20 text-[#F59E0B]",
}

export function TierBadge({ tier }: { tier: string }) {
  const key = tier in TIER_LABELS ? tier : "free"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        TIER_STYLES[key],
      )}
    >
      {TIER_LABELS[key]}
    </span>
  )
}
