"use client"

/**
 * Deal-score UI: critical-flag banners + collapsible category breakdown.
 *
 * Replaces the legacy single-number badge. Renders:
 *   1. Critical flag banners (red border for hard-cap triggers,
 *      amber for soft warnings) — ALWAYS visible above the score.
 *   2. Score dial + label + colour from `lib/dealScoring.ts`.
 *   3. "See score breakdown" disclosure that expands a per-category
 *      list with sub-factor stacks (Section 10 spec).
 *
 * Consumer: `components/analyse/analysis-results.tsx` passes the
 * ScoreResult straight in. Self-contained client component — no
 * additional fetches or state outside the disclosure toggle.
 */

import { useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ScoreResult, ScoreColour, ScoreCategory } from "@/lib/dealScoring"

interface DealScorePanelProps {
  result: ScoreResult
  /** Skip the dial/number/label — used when the page header already shows
      the score, so only critical flags, warnings and the collapsible
      category breakdown render. */
  hideScore?: boolean
}

const colourToBadge: Record<ScoreColour, string> = {
  teal: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  orange: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
  red: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
}

const colourToBar: Record<ScoreColour, string> = {
  teal: "bg-cyan-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
}

export function DealScorePanel({ result, hideScore = false }: DealScorePanelProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      {/* ── Critical flag banners (always visible) ─────────────── */}
      {result.criticalFlags.length > 0 && (
        <div className="flex flex-col gap-2">
          {result.criticalFlags.map((flag) => (
            <div
              key={flag.type}
              className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-4"
            >
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold text-red-700 dark:text-red-300">
                  {flag.message}
                </div>
                <div className="text-xs leading-relaxed text-foreground/85">
                  {flag.impact}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Score card — dial hidden when the header already shows it ── */}
      <Card>
        {!hideScore && (
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Deal Score</CardTitle>
          </CardHeader>
        )}
        <CardContent className={`flex flex-col gap-4 ${hideScore ? "py-4" : ""}`}>
          {!hideScore && (
            <div className="flex items-center gap-6">
              <div className="relative flex size-24 items-center justify-center">
                <ScoreDial total={result.total} colour={result.colour} />
              </div>
              <div className="flex flex-col gap-1">
                <span
                  className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${colourToBadge[result.colour]}`}
                >
                  {result.label}
                </span>
                <span className="text-3xl font-bold tabular-nums text-foreground">
                  {result.total}
                  <span className="text-base font-medium text-muted-foreground">
                    /100
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* Soft warnings stay visible in both modes */}
          {result.warnings.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-xs text-amber-700 dark:text-amber-400">
              {result.warnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="w-fit gap-2 text-muted-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide" : "See"} score breakdown
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>

          {/* ── Category breakdown (collapsible) ────────────────── */}
          {expanded && (
            <div className="flex flex-col gap-4 border-t border-border/40 pt-4">
              {result.categories.map((cat) => (
                <CategoryBlock
                  key={cat.name}
                  category={cat}
                  colour={result.colour}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────

function ScoreDial({
  total,
  colour,
}: {
  total: number
  colour: ScoreColour
}) {
  const pct = Math.max(0, Math.min(100, total))
  const circumference = 2 * Math.PI * 38 // r=38
  const offset = circumference * (1 - pct / 100)
  const stroke: Record<ScoreColour, string> = {
    teal: "#06b6d4",
    green: "#10b981",
    amber: "#f59e0b",
    orange: "#f97316",
    red: "#ef4444",
  }
  return (
    <svg viewBox="0 0 96 96" className="size-24 -rotate-90">
      <circle
        cx="48"
        cy="48"
        r="38"
        className="fill-none stroke-border/40"
        strokeWidth="8"
      />
      <circle
        cx="48"
        cy="48"
        r="38"
        className="fill-none"
        stroke={stroke[colour]}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  )
}

function CategoryBlock({
  category,
  colour,
}: {
  category: ScoreCategory
  colour: ScoreColour
}) {
  const pct = category.maxScore > 0
    ? (category.score / category.maxScore) * 100
    : 0
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-foreground">{category.name}</span>
        <span className="font-medium tabular-nums text-foreground">
          {category.score}/{category.maxScore}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-border/40">
        <div
          className={`h-full ${colourToBar[colour]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="flex flex-col gap-1 pl-1 text-xs text-muted-foreground">
        {category.factors.map((factor) => (
          <li key={factor.name} className="flex items-baseline justify-between gap-3">
            <span>
              • {factor.name}{" "}
              <span className="text-foreground/70">— {factor.value}</span>
            </span>
            <span className="tabular-nums text-foreground/85">
              {factor.score}/{factor.maxScore}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
