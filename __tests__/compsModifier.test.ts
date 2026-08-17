/**
 * Comps → score modifier (option C: gated, capped, honest).
 *
 * These assert the three guarantees rather than the arithmetic alone, because
 * the guarantees are what stop comps quietly corrupting the score.
 */
import { describe, it, expect } from "vitest"
import {
  applyCompsModifier,
  computeCompsAdjustment,
  MAX_ADJUSTMENT,
} from "@/lib/discovery/compsModifier"
import type { CompsValuation } from "@/lib/discovery/comps"
import type { ScoreResult } from "@/lib/dealScoring"

function valuation(over: Partial<CompsValuation> = {}): CompsValuation {
  return {
    arv: 250_000,
    pricePerSqft: 250,
    medianSoldPrice: 250_000,
    dispersionPct: 12,
    confidence: "high",
    compCount: 9,
    discountToArvPct: 14,
    comps: [],
    adjustments: [],
    excluded: [],
    ...over,
  }
}

function score(over: Partial<ScoreResult> = {}): ScoreResult {
  return {
    total: 60,
    label: "Fair Deal",
    colour: "amber",
    categories: [],
    warnings: [],
    criticalFlags: [],
    ...over,
  }
}

describe("gate — only high confidence moves the score", () => {
  it.each(["low", "medium", "none"] as const)("does not apply on %s confidence", (c) => {
    const out = applyCompsModifier(score(), valuation({ confidence: c }))
    expect(out.compsAdjustment.applied).toBe(false)
    expect(out.total).toBe(60)
    expect(out.label).toBe("Fair Deal")
  })

  it("applies on high confidence", () => {
    const out = applyCompsModifier(score(), valuation())
    expect(out.compsAdjustment.applied).toBe(true)
    expect(out.total).toBeGreaterThan(60)
  })

  it("leaves the score untouched when there is no valuation at all", () => {
    const out = applyCompsModifier(score(), null)
    expect(out.total).toBe(60)
    expect(out.compsAdjustment.applied).toBe(false)
    expect(out.warnings).toHaveLength(0)
  })

  it("does nothing when ARV or asking price is missing", () => {
    expect(
      applyCompsModifier(score(), valuation({ arv: null })).compsAdjustment.applied,
    ).toBe(false)
    expect(
      applyCompsModifier(score(), valuation({ discountToArvPct: null })).compsAdjustment.applied,
    ).toBe(false)
  })
})

describe("cap — comps tilt a deal, never manufacture one", () => {
  it("never exceeds the cap however large the discount", () => {
    const out = computeCompsAdjustment(valuation({ discountToArvPct: 90 }))
    expect(out.points).toBeLessThanOrEqual(MAX_ADJUSTMENT)
  })

  it("never exceeds the cap however far above market", () => {
    const out = computeCompsAdjustment(valuation({ discountToArvPct: -90 }))
    expect(out.points).toBeGreaterThanOrEqual(-MAX_ADJUSTMENT)
  })

  it("scales points with the size of the discount", () => {
    const small = computeCompsAdjustment(valuation({ discountToArvPct: 7 })).points
    const mid = computeCompsAdjustment(valuation({ discountToArvPct: 14 })).points
    const big = computeCompsAdjustment(valuation({ discountToArvPct: 25 })).points
    expect(small).toBeLessThan(mid)
    expect(mid).toBeLessThan(big)
  })

  it("is neutral when the asking price is in line with comps", () => {
    const out = computeCompsAdjustment(valuation({ discountToArvPct: 1 }))
    expect(out.points).toBe(0)
    expect(out.applied).toBe(false)
    expect(out.reason).toMatch(/in line with comparables/i)
  })

  it("penalises a listing priced above the comps", () => {
    expect(computeCompsAdjustment(valuation({ discountToArvPct: -15 })).points).toBe(-5)
    expect(computeCompsAdjustment(valuation({ discountToArvPct: -8 })).points).toBe(-3)
  })
})

describe("honesty — a flagged deal can only move down", () => {
  it("suppresses a bonus when a critical flag stands", () => {
    const flagged = score({
      total: 45,
      criticalFlags: [
        { type: "article4", message: "Article 4 in force", impact: "Planning required" },
      ],
    })
    const out = applyCompsModifier(flagged, valuation({ discountToArvPct: 30 }))
    expect(out.compsAdjustment.applied).toBe(false)
    expect(out.total).toBe(45) // hard cap survives
    expect(out.compsAdjustment.reason).toMatch(/critical flag/i)
  })

  it("still applies a PENALTY to a flagged deal", () => {
    const flagged = score({
      total: 45,
      criticalFlags: [{ type: "cashflow", message: "Negative", impact: "Loss" }],
    })
    const out = applyCompsModifier(flagged, valuation({ discountToArvPct: -20 }))
    expect(out.compsAdjustment.applied).toBe(true)
    expect(out.total).toBe(40)
  })
})

describe("result integrity", () => {
  it("re-bands the label to match the adjusted total", () => {
    // 67 + 3 = 70 → crosses into "Good Deal"
    const out = applyCompsModifier(score({ total: 67 }), valuation({ discountToArvPct: 14 }))
    expect(out.total).toBe(70)
    expect(out.label).toBe("Good Deal")
    expect(out.colour).toBe("green")
  })

  it("clamps within 0..100", () => {
    expect(applyCompsModifier(score({ total: 98 }), valuation({ discountToArvPct: 30 })).total).toBe(100)
    expect(
      applyCompsModifier(score({ total: 2 }), valuation({ discountToArvPct: -30 })).total,
    ).toBe(0)
  })

  it("explains itself in the warnings", () => {
    const out = applyCompsModifier(score(), valuation())
    expect(out.warnings.join(" ")).toMatch(/Comparables:/)
    expect(out.warnings.join(" ")).toMatch(/high confidence/)
  })

  it("does not mutate the original score object", () => {
    const original = score()
    applyCompsModifier(original, valuation())
    expect(original.total).toBe(60)
    expect(original.warnings).toHaveLength(0)
  })

  it("is deterministic", () => {
    const a = applyCompsModifier(score(), valuation())
    const b = applyCompsModifier(score(), valuation())
    expect(a.total).toBe(b.total)
    expect(a.compsAdjustment.points).toBe(b.compsAdjustment.points)
  })
})
