import { cn } from "@/lib/utils"
import type { TrafficLight } from "@/lib/compliance/types"

const META: Record<
  TrafficLight,
  { label: string; dot: string; text: string; ring: string }
> = {
  green: {
    label: "Compliant",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    ring: "ring-emerald-500/30",
  },
  amber: {
    label: "Due soon / check",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    ring: "ring-amber-500/30",
  },
  red: {
    label: "Overdue / missing",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    ring: "ring-red-500/30",
  },
  na: {
    label: "Not applicable",
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    ring: "ring-border/40",
  },
}

export function trafficLightMeta(status: TrafficLight) {
  return META[status]
}

export function TrafficLightDot({
  status,
  size = "md",
  title,
  className,
}: {
  status: TrafficLight
  size?: "sm" | "md" | "lg"
  title?: string
  className?: string
}) {
  const meta = META[status]
  const dim =
    size === "sm" ? "size-2.5" : size === "lg" ? "size-3.5" : "size-3"
  return (
    <span
      title={title ?? meta.label}
      aria-label={title ?? meta.label}
      className={cn(
        "inline-block shrink-0 rounded-full ring-2",
        dim,
        meta.dot,
        meta.ring,
        className,
      )}
    />
  )
}

export function TrafficLightBadge({
  status,
  className,
}: {
  status: TrafficLight
  className?: string
}) {
  const meta = META[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/60 px-2 py-0.5 text-[11px] font-medium",
        meta.text,
        className,
      )}
    >
      <TrafficLightDot status={status} size="sm" />
      {meta.label}
    </span>
  )
}
