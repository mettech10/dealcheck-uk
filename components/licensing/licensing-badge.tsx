"use client"

/**
 * Badge-ready UI hook for Deal Discovery / screener cards.
 *
 * Renders a compact traffic-light chip when a caller supplies a
 * LicensingBadgeModel. The screener must NOT hard-filter listings on
 * licensing — this component is display-only and is a no-op without a model.
 */

import { TrafficLightDot, trafficTone } from "./traffic-light"
import type { LicensingBadgeModel } from "@/lib/licensing/types"

export function LicensingBadge({
  model,
  className,
}: {
  model: LicensingBadgeModel | null | undefined
  className?: string
}) {
  if (!model) return null
  const tone = trafficTone(model.trafficLight)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${tone.bg} ${tone.border} ${tone.text} ${className ?? ""}`}
      title="Screening aid — not legal clearance"
    >
      <TrafficLightDot light={model.trafficLight} size="sm" />
      {model.label}
    </span>
  )
}
