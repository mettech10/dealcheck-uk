"use client"

/**
 * AI Refurb Estimator — Mode A of the refurbishment section: the vision
 * breakdown generated from listing photos. Mode B (no photos / analysis
 * unavailable) remains the untouched static RefurbEstimatesCard; the
 * conditional lives in analysis-results.tsx.
 *
 * The survey/contractor-quote disclaimer at the bottom is financial- and
 * safety-critical and must always render.
 */

import { useState } from "react"
import { AlertTriangle, Home } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { RefurbAnalysisResult } from "@/lib/refurbAnalysis"

const CONDITION_META: Record<string, { label: string; dot: string }> = {
  move_in_ready: { label: "Move-in Ready", dot: "bg-success" },
  cosmetic: { label: "Cosmetic Work Only", dot: "bg-success" },
  light_refurb: { label: "Light Refurb Needed", dot: "bg-warning" },
  full_refurb: { label: "Full Refurbishment", dot: "bg-destructive" },
  structural: { label: "Structural Works Required", dot: "bg-destructive" },
}

const ROOM_DOT: Record<string, string> = {
  excellent: "bg-success",
  good: "bg-success/70",
  fair: "bg-warning",
  poor: "bg-destructive",
}

const SEVERITY_DOT: Record<string, string> = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-success",
}

const fmtK = (n: number) =>
  n >= 1000 ? `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `£${Math.round(n).toLocaleString("en-GB")}`

export function AIRefurbEstimator({
  analysis,
}: {
  analysis: RefurbAnalysisResult
}) {
  const [view, setView] = useState<"essential" | "full">("essential")

  const cond = CONDITION_META[analysis.overallCondition] ?? {
    label: analysis.overallCondition,
    dot: "bg-muted-foreground",
  }

  const totals =
    view === "essential"
      ? {
          low: analysis.totals.essentialOnlyLow,
          mid: analysis.totals.essentialOnlyMid,
          high: analysis.totals.essentialOnlyHigh,
        }
      : {
          low: analysis.totals.fullRefurbLow,
          mid: analysis.totals.fullRefurbMid,
          high: analysis.totals.fullRefurbHigh,
        }

  const visibleRooms = analysis.rooms.filter(
    (r) => r.visible && (view === "full" || r.isEssential),
  )
  const essentialAdditional = analysis.additionalItems.filter(
    (i) => view === "full" || i.isEssential,
  )

  return (
    <Card className="overflow-hidden py-0">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/40 py-4">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Home className="size-4 text-muted-foreground" />
            Refurb Calculator
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Analysed {analysis.photosAnalysed} listing photos · {analysis.region}
            {analysis.regionalMultiplier !== 1 && (
              <span className="ml-1 text-muted-foreground/70">
                (regional costs applied)
              </span>
            )}
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-border/50 bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {analysis.conditionConfidence} confidence
        </span>
      </CardHeader>

      <CardContent className="flex flex-col gap-0 p-0">
        {/* ── Condition detected ────────────────────────────────────── */}
        <div className="border-b border-border/40 bg-muted/20 px-6 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Condition detected from photos
          </p>
          <p className="mt-1 flex items-center gap-2 text-lg font-semibold text-foreground">
            <span className={`size-2.5 rounded-full ${cond.dot}`} />
            {cond.label}
          </p>
          <p className="mt-1 text-sm italic text-muted-foreground">
            “{analysis.conditionReasoning}”
          </p>
        </div>

        {/* ── Red flags ─────────────────────────────────────────────── */}
        {analysis.redFlags.length > 0 && (
          <div className="border-b border-border/40 px-6 py-4">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <AlertTriangle className="size-4 text-muted-foreground" />
              Issues to investigate
            </p>
            <div className="flex flex-col gap-2.5">
              {analysis.redFlags.map((flag, i) => (
                <div
                  key={i}
                  className="flex gap-3 rounded-lg border border-border/40 bg-muted/20 p-3"
                >
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      SEVERITY_DOT[flag.severity] ?? "bg-warning"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {flag.flag}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {flag.location} — {flag.recommendation}
                    </p>
                    {flag.estimatedCost > 0 && (
                      <p className="mt-0.5 text-xs font-medium text-foreground">
                        Est. cost: {fmtK(flag.estimatedCost)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── View toggle ───────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 px-6 py-3">
          <span className="text-sm font-semibold text-foreground">
            Room-by-room breakdown
          </span>
          <div className="flex rounded-lg border border-border/50 bg-muted/30 p-0.5">
            {(
              [
                ["essential", "Essential only"],
                ["full", "Full refurb"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  view === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Rooms ─────────────────────────────────────────────────── */}
        <div>
          {visibleRooms.map((room, i) => (
            <div
              key={i}
              className="flex gap-3 border-b border-border/30 px-6 py-4"
            >
              <span
                className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                  ROOM_DOT[room.condition] ?? "bg-muted-foreground"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm font-semibold text-foreground">
                    {room.room}
                    <span className="ml-2 text-xs font-medium capitalize text-muted-foreground">
                      {room.condition}
                    </span>
                  </p>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-foreground">
                      {fmtK(room.costLow)} – {fmtK(room.costHigh)}
                    </p>
                    {!room.isEssential && (
                      <p className="text-[10px] text-muted-foreground">optional</p>
                    )}
                  </div>
                </div>
                {room.workNeeded.length > 0 && (
                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {room.workNeeded.map((w, j) => (
                      <li
                        key={j}
                        className="flex items-baseline gap-2 text-xs text-muted-foreground"
                      >
                        <span className="size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
                {room.notes && (
                  <p className="mt-1.5 text-xs italic text-muted-foreground/80">
                    {room.notes}
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* Additional items */}
          {essentialAdditional.length > 0 && (
            <div className="border-b border-border/30 px-6 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Additional items
              </p>
              <div className="flex flex-col gap-2">
                {essentialAdditional.map((item, i) => (
                  <div key={i} className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {item.item}
                        {item.isEssential && (
                          <span className="ml-2 text-[10px] font-bold uppercase text-destructive">
                            essential
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.reason}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-foreground">
                      {fmtK(item.costLow)} – {fmtK(item.costHigh)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Totals + recommendation ───────────────────────────────── */}
        <div className="border-t border-border/40 bg-muted/20 px-6 py-5">
          <div className="mb-4 grid grid-cols-3 gap-4 text-center">
            {[
              { label: "Conservative", value: totals.low },
              { label: "Mid estimate", value: totals.mid, highlight: true },
              { label: "Worst case", value: totals.high },
            ].map((t) => (
              <div key={t.label}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t.label}
                </p>
                <p
                  className={
                    t.highlight
                      ? "text-2xl font-bold text-foreground"
                      : "text-lg font-bold text-foreground"
                  }
                >
                  {fmtK(t.value)}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border/40 bg-card/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Strategy recommendation
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {analysis.strategyRecommendation.reasoning}
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-xs font-semibold text-foreground">
              {analysis.strategyRecommendation.estimatedValueAdd > 0 && (
                <span>
                  +{fmtK(analysis.strategyRecommendation.estimatedValueAdd)} value add
                </span>
              )}
              {analysis.strategyRecommendation.estimatedRentIncrease > 0 && (
                <span>
                  +£{analysis.strategyRecommendation.estimatedRentIncrease}/mo rent
                </span>
              )}
            </div>
          </div>

          {analysis.roomsNotVisible.length > 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden>⚠</span>
              Not visible in photos: {analysis.roomsNotVisible.join(", ")}. Get a
              full survey before committing to your refurb budget.
            </p>
          )}
        </div>

        {/* ── Permanent disclaimer — always renders ─────────────────── */}
        <div className="border-t border-border/40 px-6 py-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground/80">
            ⚠ AI estimates are based on visible photo evidence only. Electrics,
            plumbing, roof structure and damp cannot be fully assessed from
            photos. Always commission a RICS survey and get 3 contractor quotes
            before finalising your refurb budget.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
