/**
 * Stat card — overview dashboard headline metric.
 *
 * Visual: dark card with teal top border, teal-filled icon circle,
 * large white number, grey sub-label. Subtle teal glow on hover.
 *
 * Pure presentational — caller supplies icon component, label,
 * value (string for currency/comma formatting flexibility) and
 * sublabel. All numbers come pre-formatted from the page.
 */

import type { LucideIcon } from "lucide-react"

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string
  sublabel?: string
}

export function StatCard({ icon: Icon, label, value, sublabel }: StatCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-6 transition-shadow hover:shadow-[0_0_30px_rgba(0,191,165,0.15)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00BFA5] to-transparent opacity-60"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-[#9CA3AF]">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
          {sublabel && (
            <p className="mt-1 text-xs text-[#9CA3AF]">{sublabel}</p>
          )}
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#00BFA5]/15">
          <Icon className="size-4 text-[#00BFA5]" />
        </div>
      </div>
    </div>
  )
}
