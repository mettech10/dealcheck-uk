"use client"

/**
 * EPC energy-band chip. Colour-coded A–G, with a MEES flag for F/G (below
 * the E minimum a property must meet to be let). Renders nothing when the
 * band is unknown, so callers can drop it in unconditionally.
 */

const BAND_COLOR: Record<string, string> = {
  A: "bg-emerald-600",
  B: "bg-emerald-600",
  C: "bg-lime-600",
  D: "bg-yellow-500",
  E: "bg-amber-500",
  F: "bg-orange-600",
  G: "bg-red-600",
}

export function EpcBadge({
  band,
  className,
}: {
  band?: string | null
  className?: string
}) {
  if (!band) return null
  const b = band.toUpperCase()
  if (!/^[A-G]$/.test(b)) return null
  const color = BAND_COLOR[b] ?? "bg-muted-foreground"
  const belowMees = b === "F" || b === "G"

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-card px-2 py-1 text-xs ${className ?? ""}`}
      title={
        belowMees
          ? `EPC band ${b} — below the minimum E required to let (MEES). Improvement works likely needed.`
          : `EPC energy band ${b}`
      }
    >
      <span
        className={`flex size-4 items-center justify-center rounded text-[10px] font-bold text-white ${color}`}
      >
        {b}
      </span>
      <span className="text-muted-foreground">
        EPC{belowMees ? " · below MEES" : ""}
      </span>
    </span>
  )
}
