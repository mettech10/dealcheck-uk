"use client"

/**
 * Investment Strategy selector.
 *
 * The full result above is modelled for the SELECTED strategy. This panel
 * keeps the results page focused: instead of a wall of per-strategy cards it
 * shows the current strategy and a clean dropdown to switch to another one
 * (which re-runs the full analysis). A single, subtle hint surfaces a
 * stronger alternative only when one genuinely exists.
 */
import type { InvestmentType } from "@/lib/types"
import { estimateStrategies, bestAlternative } from "@/lib/strategyEstimates"
import type { PropertyFormData, CalculationResults, BackendResults } from "@/lib/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface AlternativeStrategiesPanelProps {
  data: PropertyFormData
  results: CalculationResults
  backendData?: BackendResults | null
  /** Invoked when the user asks to fully analyse a different strategy. */
  onSwitch?: (strategy: InvestmentType) => void
}

export function AlternativeStrategiesPanel({
  data,
  results,
  backendData,
  onSwitch,
}: AlternativeStrategiesPanelProps) {
  const estimates = estimateStrategies(data, results, backendData ?? undefined)
  const current = data.investmentType
  const currentEst = estimates.find((e) => e.strategy === current)
  const best = bestAlternative(estimates, current)

  // Only nudge when an alternative is a real improvement on the current
  // strategy's comparable metric.
  const showHint =
    !!best &&
    typeof best.primaryMetric === "number" &&
    (currentEst?.primaryMetric == null || best.primaryMetric > (currentEst.primaryMetric ?? 0))

  return (
    <section className="flex flex-col gap-3 print:hidden">
      <div>
        <h3 className="text-base font-semibold text-foreground">Investment Strategy</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          This analysis is modelled as{" "}
          <span className="font-medium text-foreground">{currentEst?.label ?? current.toUpperCase()}</span>. Switch
          strategy to re-run the full analysis with your inputs.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <label htmlFor="strategy-switch" className="text-sm font-medium text-foreground">
            Strategy
          </label>
          <Select
            value={current}
            onValueChange={(v) => {
              if (v !== current) onSwitch?.(v as InvestmentType)
            }}
          >
            <SelectTrigger id="strategy-switch" className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {estimates.map((e) => {
                const isCurrent = e.strategy === current
                const hint = isCurrent
                  ? "Current"
                  : e.available && typeof e.primaryMetric === "number"
                  ? `${e.primaryMetric.toFixed(1)}% est. ${e.primaryMetricLabel ?? "yield"}`
                  : "Not available here"
                return (
                  <SelectItem key={e.strategy} value={e.strategy}>
                    <span className="font-medium">{e.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{hint}</span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        {showHint && best && onSwitch && (
          <button
            type="button"
            onClick={() => onSwitch(best.strategy)}
            className="inline-flex items-center gap-1 self-start rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 sm:self-auto"
          >
            {best.label} looks stronger ({best.primaryMetric!.toFixed(1)}% est.{" "}
            {best.primaryMetricLabel ?? "yield"}) — switch →
          </button>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        Estimates shown for other strategies use market averages and assumptions. Switch to a strategy for accurate
        figures based on your specific inputs.
      </p>
    </section>
  )
}
