"use client"

/**
 * Feature A — "How This Property Compares Across Strategies".
 *
 * Renders a row of rough, client-side ESTIMATE cards for every strategy so
 * users can eyeball which exits look promising before committing to a full
 * re-analysis. Estimates come from `estimateStrategies` (no engine touched).
 *
 * Layout: horizontal scroll-snap row on mobile, multi-column grid on
 * desktop. The current strategy shows a teal "Current Strategy" badge;
 * others show a "Switch →" button that calls `onSwitch`.
 */
import type { InvestmentType } from "@/lib/types"
import type { StrategyEstimate } from "@/lib/strategyEstimates"
import { estimateStrategies, bestAlternative } from "@/lib/strategyEstimates"
import type { PropertyFormData, CalculationResults, BackendResults } from "@/lib/types"

interface AlternativeStrategiesPanelProps {
  data: PropertyFormData
  results: CalculationResults
  backendData?: BackendResults | null
  /** Invoked when the user asks to fully analyse a different strategy. */
  onSwitch?: (strategy: InvestmentType) => void
}

function StrategyCard({
  est,
  isCurrent,
  onSwitch,
}: {
  est: StrategyEstimate
  isCurrent: boolean
  onSwitch?: (s: InvestmentType) => void
}) {
  const disabled = !est.available
  return (
    <div
      className={`flex min-w-[200px] shrink-0 snap-start flex-col gap-2 rounded-xl border p-4 sm:min-w-0 ${
        isCurrent
          ? "border-primary/50 bg-primary/5"
          : disabled
          ? "border-border/40 bg-muted/30"
          : "border-border/60 bg-card"
      }`}
    >
      {/* Name */}
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${disabled ? "text-muted-foreground" : "text-foreground"}`}>
          {est.label}
        </span>
      </div>

      <div className="h-px bg-border/50" />

      {/* Metrics OR disabled note */}
      {disabled ? (
        <p className="py-2 text-xs text-muted-foreground">{est.disabledNote ?? est.headline}</p>
      ) : (
        <>
          <div>
            <p className="text-sm font-semibold text-foreground">{est.headline}</p>
            {est.secondary && <p className="text-xs text-muted-foreground">{est.secondary}</p>}
          </div>
          {est.warningBadge && (
            <span className="inline-flex w-fit items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              {est.warningBadge}
            </span>
          )}
          <p className="text-[11px] text-muted-foreground/80">{est.dataSource}</p>
        </>
      )}

      <div className="mt-auto pt-1">
        {isCurrent ? (
          <span className="inline-flex items-center rounded-md bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
            Current Strategy
          </span>
        ) : disabled ? (
          <button
            type="button"
            onClick={() => onSwitch?.(est.strategy)}
            className="inline-flex items-center rounded-md border border-border/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Analyse fully →
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSwitch?.(est.strategy)}
            className="inline-flex items-center rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Switch →
          </button>
        )}
      </div>
    </div>
  )
}

export function AlternativeStrategiesPanel({
  data,
  results,
  backendData,
  onSwitch,
}: AlternativeStrategiesPanelProps) {
  const estimates = estimateStrategies(data, results, backendData ?? undefined)
  const current = data.investmentType
  const best = bestAlternative(estimates, current)

  // Surface the best alternative as a hint only when it's a meaningful
  // improvement over the current strategy's comparable metric.
  const currentEst = estimates.find((e) => e.strategy === current)
  const showHint =
    best &&
    typeof best.primaryMetric === "number" &&
    (currentEst?.primaryMetric == null || best.primaryMetric > (currentEst.primaryMetric ?? 0))

  return (
    <section className="flex flex-col gap-3 print:hidden">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          How This Property Compares Across Strategies
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Indicative estimates based on market data. Switch strategy for a full analysis.
        </p>
      </div>

      {/* Mobile: horizontal scroll-snap row. Desktop: responsive grid. */}
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-6">
        {estimates.map((est) => (
          <StrategyCard
            key={est.strategy}
            est={est}
            isCurrent={est.strategy === current}
            onSwitch={onSwitch}
          />
        ))}
      </div>

      {/* Best-alternative hint (Section 4, Step 2) */}
      {showHint && best && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
          <p className="text-xs text-foreground">
            The <span className="font-semibold">{best.label}</span> strategy shows an estimated{" "}
            <span className="font-semibold">{best.primaryMetric!.toFixed(1)}%</span>{" "}
            {best.primaryMetricLabel ?? "yield"} on this property
          </p>
          {onSwitch && (
            <button
              type="button"
              onClick={() => onSwitch(best.strategy)}
              className="inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15"
            >
              Switch to {best.label} →
            </button>
          )}
        </div>
      )}

      <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400/90">
        These are rough estimates to guide strategy selection — not full analyses. Figures use
        market averages and assumptions. Switch to a strategy for accurate numbers based on your
        specific inputs.
      </p>
    </section>
  )
}
