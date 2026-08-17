/**
 * Comps → deal score (gated modifier).
 *
 * Applied AFTER scoreDeal(), never inside it, so a deal with no comp coverage
 * scores exactly as it does today. Three guarantees, in priority order:
 *
 *   1. GATED    — only a `high` confidence valuation may move the score. A
 *                 thin or scattered comp set is information, not evidence.
 *   2. CAPPED   — at most ±MAX_ADJUSTMENT points, so comps can tilt a deal but
 *                 never manufacture one.
 *   3. HONEST   — a deal carrying a critical flag (Article 4, negative
 *                 cashflow, …) can only ever be moved DOWN. scoreDeal applies
 *                 hard caps to stop a fundamentally broken deal looking good;
 *                 letting a discount add points back would silently defeat
 *                 that, so bonuses are suppressed while a flag stands.
 *
 * Pure and deterministic — no DB, no LLM.
 */
import { bandFromTotal, type ScoreResult } from "@/lib/dealScoring"
import type { CompsValuation } from "@/lib/discovery/comps"

/** Hard ceiling on how much comps may move a score, either direction. */
export const MAX_ADJUSTMENT = 5

/**
 * Points by how far asking sits below ARV. Ordered best → worst; the first
 * matching band wins. Positive = below comps (a discount, good).
 */
const BANDS: Array<[minDiscountPct: number, points: number]> = [
  [20, 5],
  [12, 3],
  [6, 1],
  [-5, 0], // roughly at market — no opinion
  [-12, -3],
  [-Infinity, -5], // materially above the comps
]

export interface CompsAdjustment {
  applied: boolean
  points: number
  reason: string
}

/** Work out the adjustment without applying it (useful for explaining/UI). */
export function computeCompsAdjustment(
  valuation: CompsValuation | null | undefined,
  opts: { hasCriticalFlags?: boolean } = {},
): CompsAdjustment {
  if (!valuation) {
    return { applied: false, points: 0, reason: "No comparable valuation available" }
  }
  if (valuation.confidence !== "high") {
    return {
      applied: false,
      points: 0,
      reason: `Comp confidence is ${valuation.confidence} (${valuation.compCount} comps) — score unchanged`,
    }
  }
  if (valuation.discountToArvPct == null || valuation.arv == null) {
    return { applied: false, points: 0, reason: "No ARV or asking price to compare" }
  }

  const discount = valuation.discountToArvPct
  let points = 0
  for (const [min, pts] of BANDS) {
    if (discount >= min) {
      points = pts
      break
    }
  }
  points = Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, points))

  if (points === 0) {
    return {
      applied: false,
      points: 0,
      reason: `Asking price is in line with comparables (${discount.toFixed(1)}% vs ARV)`,
    }
  }

  // Never let comps rescue a deal the scorer has already flagged.
  if (points > 0 && opts.hasCriticalFlags) {
    return {
      applied: false,
      points: 0,
      reason: `${discount.toFixed(1)}% below comparables, but the deal carries a critical flag — no bonus applied`,
    }
  }

  const direction = points > 0 ? "below" : "above"
  return {
    applied: true,
    points,
    reason:
      `${Math.abs(discount).toFixed(1)}% ${direction} comparable value ` +
      `(ARV £${valuation.arv.toLocaleString("en-GB")} from ${valuation.compCount} comps, high confidence) ` +
      `→ ${points > 0 ? "+" : ""}${points}`,
  }
}

/**
 * Return a new ScoreResult with the comps adjustment applied. The original is
 * never mutated, and the total stays within 0–100.
 */
export function applyCompsModifier(
  score: ScoreResult,
  valuation: CompsValuation | null | undefined,
): ScoreResult & { compsAdjustment: CompsAdjustment } {
  const adjustment = computeCompsAdjustment(valuation, {
    hasCriticalFlags: (score.criticalFlags?.length ?? 0) > 0,
  })

  if (!adjustment.applied) {
    return { ...score, compsAdjustment: adjustment }
  }

  const total = Math.max(0, Math.min(100, score.total + adjustment.points))

  return {
    ...score,
    total,
    // Re-band through the scorer's own logic so the label always matches the
    // adjusted number and can never drift from it.
    ...bandFromTotal(total),
    warnings: [...score.warnings, `Comparables: ${adjustment.reason}`],
    compsAdjustment: adjustment,
  }
}
