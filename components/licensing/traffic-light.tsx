import { cn } from "@/lib/utils"
import type { TrafficLight } from "@/lib/licensing/types"

const TONE: Record<
  TrafficLight,
  { dot: string; text: string; bg: string; border: string; label: string }
> = {
  red: {
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    label: "Red",
  },
  amber: {
    dot: "bg-amber-500",
    text: "text-amber-800 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    label: "Amber",
  },
  green: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    label: "Green",
  },
  grey: {
    dot: "bg-zinc-400 dark:bg-zinc-500",
    text: "text-muted-foreground",
    bg: "bg-muted/60",
    border: "border-border/60",
    label: "Grey",
  },
}

export function trafficTone(light: TrafficLight) {
  return TONE[light]
}

export function TrafficLightDot({
  light,
  size = "md",
  className,
}: {
  light: TrafficLight
  size?: "sm" | "md"
  className?: string
}) {
  const tone = TONE[light]
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-full",
        size === "sm" ? "size-2" : "size-2.5",
        tone.dot,
        className,
      )}
    />
  )
}

export function TrafficLightLabel({
  light,
  className,
}: {
  light: TrafficLight
  className?: string
}) {
  const tone = TONE[light]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        tone.bg,
        tone.border,
        tone.text,
        className,
      )}
    >
      <TrafficLightDot light={light} size="sm" />
      {tone.label}
    </span>
  )
}
