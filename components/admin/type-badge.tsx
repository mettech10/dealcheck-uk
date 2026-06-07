/**
 * Type badge — colour-coded pill for a payment_history.tier value.
 *
 * Shorter labels than TierBadge ("PPA", "Pro Monthly") since the
 * payments table uses them for the Type column.
 */

import { cn } from "@/lib/utils"

const LABELS: Record<string, string> = {
  pay_per_analysis: "PPA",
  pro: "Pro Monthly",
  enterprise: "Enterprise",
  free: "Free",
}

const STYLES: Record<string, string> = {
  pay_per_analysis: "bg-[#3B82F6]/20 text-[#60A5FA]",
  pro: "bg-[#00BFA5]/20 text-[#00BFA5]",
  enterprise: "bg-[#F59E0B]/20 text-[#F59E0B]",
  free: "bg-[#9CA3AF]/20 text-[#9CA3AF]",
}

export function TypeBadge({ type }: { type: string }) {
  const key = type in LABELS ? type : "pay_per_analysis"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        STYLES[key],
      )}
    >
      {LABELS[key]}
    </span>
  )
}
