"use client"

/**
 * Auto-ARV estimator — shared by BRRRR and Flip forms.
 *
 * Given postcode / property type / bedrooms / floor size (sqft → m²), hits
 * /api/arv/calculate and lets the user one-click-select a Conservative,
 * Mid, or Optimistic ARV. Pre-selects Mid on successful load.
 *
 * Fails gracefully: if the service returns an error envelope (no comps
 * available etc.), we surface the message as a hint — the manual ARV
 * input above continues to work unchanged. We never block the form.
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
} from "lucide-react"
import { formatCurrency } from "@/lib/calculations"

interface ArvComparable {
  address: string
  saleDate: string
  salePrice: number
  floorAreaM2: number
  pricePerM2: number
  similarityScore: number
  source: string
  floorAreaEstimated: boolean
}

export interface ArvEstimate {
  conservativeARV: number
  midARV: number
  optimisticARV: number
  avgPricePerM2: number
  subjectFloorSizeM2: number
  comparablesUsed: number
  comparables: ArvComparable[]
  methodology: string
  dataSource: string
  epcDataUsed: boolean
  wideningLabel?: string
  relaxation?: string
}

interface AutoArvButtonProps {
  /** Subject postcode — "M1 1AE" or "BL4 8LQ". */
  postcode: string
  /** "house" | "flat" | "commercial" — coarse category. */
  propertyType?: string
  /** "semi-detached" | "terraced" | "flat-apartment" etc. — finer bucket. */
  propertyTypeDetail?: string
  /** Number of bedrooms. */
  bedrooms?: number
  /** Floor size in sqft (form field). We convert to m² for the API. */
  sqft?: number
  /** Currently-entered ARV (for the "vs auto" comparison). */
  currentArv?: number
  /** Called when user picks a scenario. Parent should setValue("arv", n). */
  onSelectArv: (arv: number, source: "conservative" | "mid" | "optimistic") => void
  /** Emits the full estimate so parent can pipe it into sensitivity defaults. */
  onEstimate?: (estimate: ArvEstimate | null) => void
}

// 1 sqft = 0.09290304 m² (Imperial→SI)
const SQFT_TO_M2 = 0.09290304

export function AutoArvButton({
  postcode,
  propertyType,
  propertyTypeDetail,
  bedrooms,
  sqft,
  currentArv,
  onSelectArv,
  onEstimate,
}: AutoArvButtonProps) {
  const [loading, setLoading] = useState(false)
  const [estimate, setEstimate] = useState<ArvEstimate | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selected, setSelected] = useState<"conservative" | "mid" | "optimistic" | null>(null)
  const [compsOpen, setCompsOpen] = useState(false)

  const canFetch =
    typeof postcode === "string" && postcode.trim().length >= 2 && (bedrooms || 0) > 0

  async function fetchArv() {
    setLoading(true)
    setErrorMsg(null)
    try {
      const resp = await fetch("/api/arv/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode: postcode.trim().toUpperCase(),
          propertyType,
          propertyTypeDetail,
          bedrooms,
          floorSizeM2: sqft && sqft > 0 ? sqft * SQFT_TO_M2 : undefined,
        }),
      })
      const data = await resp.json()
      if (data && typeof data.midARV === "number") {
        setEstimate(data as ArvEstimate)
        setErrorMsg(null)
        // Pre-select Mid and propagate up.
        setSelected("mid")
        onSelectArv(data.midARV, "mid")
        onEstimate?.(data as ArvEstimate)
      } else {
        setEstimate(null)
        setErrorMsg(
          data?.message ||
            "Insufficient comparable data — please enter ARV manually",
        )
        onEstimate?.(null)
      }
    } catch (e) {
      setEstimate(null)
      setErrorMsg("Auto-ARV failed — please enter ARV manually")
      onEstimate?.(null)
    } finally {
      setLoading(false)
    }
  }

  function pickScenario(which: "conservative" | "mid" | "optimistic") {
    if (!estimate) return
    const val =
      which === "conservative"
        ? estimate.conservativeARV
        : which === "mid"
          ? estimate.midARV
          : estimate.optimisticARV
    setSelected(which)
    onSelectArv(val, which)
  }

  // ── Render ─────────────────────────────────────────────────────────

  if (!estimate && !errorMsg) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={fetchArv}
          disabled={!canFetch || loading}
          className="h-9 w-full justify-center gap-2 text-xs"
        >
          {loading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Looking up comparables…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5 text-primary" />
              Auto-Calculate ARV
            </>
          )}
        </Button>
        {!canFetch && (
          <p className="text-[11px] text-muted-foreground">
            Enter postcode and bedrooms to enable auto-ARV.
          </p>
        )}
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
        <div className="flex items-start gap-2">
          <Calculator className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div className="flex flex-col gap-1">
            <p className="font-medium text-amber-700 dark:text-amber-300">
              Auto-ARV unavailable
            </p>
            <p className="text-muted-foreground">{errorMsg}</p>
            <button
              type="button"
              onClick={fetchArv}
              className="mt-1 self-start text-[11px] underline text-muted-foreground hover:text-foreground"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  // estimate is non-null here
  const e = estimate!
  const delta =
    currentArv && e.midARV
      ? ((currentArv - e.midARV) / e.midARV) * 100
      : 0

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            Auto ARV Estimate
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {e.comparablesUsed} comps
          </Badge>
        </div>
        <button
          type="button"
          onClick={fetchArv}
          disabled={loading}
          className="text-[11px] text-muted-foreground underline hover:text-foreground"
        >
          {loading ? "Refreshing…" : "Re-run"}
        </button>
      </div>

      {/* Three scenario cards */}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            { key: "conservative", label: "Conservative", value: e.conservativeARV, hint: "Lower comps" },
            { key: "mid", label: "Mid (recommended)", value: e.midARV, hint: "Weighted avg" },
            { key: "optimistic", label: "Optimistic", value: e.optimisticARV, hint: "Upper comps" },
          ] as const
        ).map((opt) => {
          const active = selected === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => pickScenario(opt.key)}
              className={
                "flex flex-col items-start gap-0.5 rounded-md border p-2 text-left transition " +
                (active
                  ? "border-primary bg-primary/10"
                  : "border-border/50 bg-background hover:border-primary/40")
              }
            >
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {opt.label}
              </span>
              <span className="text-sm font-bold text-foreground">
                {formatCurrency(opt.value)}
              </span>
              <span className="text-[10px] text-muted-foreground">{opt.hint}</span>
            </button>
          )
        })}
      </div>

      {/* Methodology */}
      <p className="text-[11px] text-muted-foreground leading-snug">
        {e.methodology}
      </p>

      {/* Current-vs-auto comparison */}
      {typeof currentArv === "number" && currentArv > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Your entered ARV: <strong>{formatCurrency(currentArv)}</strong> vs
          auto-mid <strong>{formatCurrency(e.midARV)}</strong>{" "}
          <span className={delta >= 0 ? "text-success" : "text-destructive"}>
            ({delta >= 0 ? "+" : ""}
            {delta.toFixed(1)}% {delta >= 0 ? "above" : "below"})
          </span>
        </p>
      )}

      {/* Comps collapsible */}
      <button
        type="button"
        onClick={() => setCompsOpen((s) => !s)}
        className="flex items-center gap-1 self-start text-[11px] text-muted-foreground hover:text-foreground"
      >
        {compsOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        {compsOpen ? "Hide" : "Show"} comparable sales used
      </button>

      {compsOpen && e.comparables.length > 0 && (
        <div className="overflow-x-auto rounded border border-border/50">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Address</th>
                <th className="px-2 py-1.5 text-left font-medium">Date</th>
                <th className="px-2 py-1.5 text-right font-medium">Sale £</th>
                <th className="px-2 py-1.5 text-right font-medium">Size m²</th>
                <th className="px-2 py-1.5 text-right font-medium">£/m²</th>
                <th className="px-2 py-1.5 text-right font-medium">Match</th>
              </tr>
            </thead>
            <tbody>
              {e.comparables.map((c, i) => (
                <tr key={i} className="border-t border-border/30">
                  <td className="px-2 py-1.5 text-foreground">
                    <div className="truncate max-w-[180px]">{c.address}</div>
                    <div className="text-[10px] text-muted-foreground">{c.source}</div>
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{c.saleDate}</td>
                  <td className="px-2 py-1.5 text-right font-medium text-foreground">
                    {formatCurrency(c.salePrice)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">
                    {c.floorAreaM2}
                    {c.floorAreaEstimated && <span className="text-[9px]">*</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">
                    £{c.pricePerM2.toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Badge
                      variant={
                        c.similarityScore >= 0.8
                          ? "default"
                          : c.similarityScore >= 0.5
                            ? "secondary"
                            : "outline"
                      }
                      className="text-[9px] px-1 py-0"
                    >
                      {c.similarityScore >= 0.8
                        ? "High"
                        : c.similarityScore >= 0.5
                          ? "Med"
                          : "Low"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {e.comparables.some((c) => c.floorAreaEstimated) && (
            <p className="px-2 py-1 text-[10px] text-muted-foreground">
              * floor area estimated from subject / postcode median — EPC match unavailable
            </p>
          )}
        </div>
      )}
    </div>
  )
}
