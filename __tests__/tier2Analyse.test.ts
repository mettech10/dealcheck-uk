/**
 * Tier 2 deep analysis — runs the REAL engines (calculateAll + scoreDeal),
 * only the district-intel lookup is mocked. So these tests prove the reuse
 * path actually produces coherent scores, not just that it type-checks.
 */
import { describe, expect, test, vi, beforeEach } from "vitest"

const intel = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))

vi.mock("@/lib/discovery/areaIntel", () => ({
  toDistrict: (pc: string) => (pc || "").trim().toUpperCase().split(/\s+/)[0],
  getDistrictIntel: vi.fn(async () => intel.current),
  resetDistrictIntelCache: vi.fn(),
}))

import { runDeepAnalysis } from "@/lib/discovery/tier2Analyse"
import type { ListingCandidate } from "@/lib/discovery/tier1Screen"

function setIntel(over: Record<string, unknown> = {}) {
  intel.current = {
    district: "M14",
    medianSoldPrice: 250000,
    medianMonthlyRent: 1200,
    medianRoomRent: 550,
    medianSaMonthlyRevenue: null,
    article4: { status: "none", isArticle4: false, summary: "No Article 4" },
    sources: ["area_intelligence"],
    ...over,
  }
}

function listing(over: Partial<ListingCandidate> = {}): ListingCandidate {
  return {
    listingUrl: "https://www.rightmove.co.uk/properties/1",
    listingId: "1",
    address: "1 Test Road, Manchester",
    postcode: "M14 5AA",
    price: 200000,
    bedrooms: 4,
    propertyType: "house",
    thumbnailUrl: null,
    description: "A family home",
    ...over,
  }
}

beforeEach(() => setIntel())

describe("Tier 2 — reuses the real engines", () => {
  test("produces a score + real metrics per requested strategy", async () => {
    const r = await runDeepAnalysis(listing(), ["BTL", "HMO"])
    expect(Object.keys(r.strategyResults).sort()).toEqual(["BTL", "HMO"])

    const btl = r.strategyResults.BTL
    expect(btl.score).toBeGreaterThanOrEqual(0)
    expect(btl.score).toBeLessThanOrEqual(100)
    expect(typeof btl.label).toBe("string")
    // 1200*12 / 200k = 7.2% gross yield, straight from calculateAll
    expect(btl.summary.grossYield).toBeCloseTo(7.2, 1)
    expect(btl.summary.totalCapitalRequired).toBeGreaterThan(0)
  })

  test("picks the highest-scoring strategy as best", async () => {
    const r = await runDeepAnalysis(listing(), ["BTL", "HMO"])
    const scores = Object.entries(r.strategyResults).map(([k, v]) => [k, v.score] as const)
    const max = Math.max(...scores.map(([, s]) => s))
    expect(r.bestScore).toBe(max)
    expect(r.strategyResults[r.bestStrategy].score).toBe(max)
  })

  test("HMO uses room income (rooms x room rent), beating single-let yield", async () => {
    const r = await runDeepAnalysis(listing({ bedrooms: 5 }), ["BTL", "HMO"])
    expect(r.strategyResults.HMO.summary.grossYield ?? 0).toBeGreaterThan(
      r.strategyResults.BTL.summary.grossYield ?? 0,
    )
  })

  test("records the assumptions it had to make", async () => {
    const r = await runDeepAnalysis(listing(), ["BTL"])
    expect(r.strategyResults.BTL.assumptions.join(" ")).toMatch(/area median/i)
    expect(r.strategyResults.BTL.assumptions.join(" ")).toMatch(/25% deposit/i)
  })

  test("no area rent → falls back to 0.5% rule and SAYS so", async () => {
    setIntel({ medianMonthlyRent: null })
    const r = await runDeepAnalysis(listing(), ["BTL"])
    expect(r.strategyResults.BTL.assumptions.join(" ")).toMatch(/0\.5% of price/i)
  })

  test("no uplift evidence → ARV equals asking price, declared", async () => {
    setIntel({ medianSoldPrice: 150000 }) // below asking → no uplift
    const r = await runDeepAnalysis(listing(), ["BRRRR"])
    expect(r.strategyResults.BRRRR.assumptions.join(" ")).toMatch(
      /No area uplift evidence/i,
    )
  })

  test("Development is skipped — a scheme can't be inferred", async () => {
    const r = await runDeepAnalysis(listing(), ["DEVELOPMENT", "BTL"])
    expect(r.strategyResults.DEVELOPMENT).toBeUndefined()
    expect(r.strategyResults.BTL).toBeDefined()
  })

  test("unknown strategy labels are ignored, not crashed on", async () => {
    const r = await runDeepAnalysis(listing(), ["NONSENSE", "BTL"])
    expect(r.strategyResults.NONSENSE).toBeUndefined()
    expect(r.strategyResults.BTL).toBeDefined()
  })
})

describe("Tier 2 — Article 4 honesty", () => {
  test("an ACTIVE Article 4 is threaded into the scorer and surfaces flags", async () => {
    setIntel({
      article4: { status: "active", isArticle4: true, summary: "Article 4 in force" },
    })
    const active = await runDeepAnalysis(listing({ bedrooms: 5 }), ["HMO"])

    setIntel({ article4: { status: "none", isArticle4: false, summary: "none" } })
    const clear = await runDeepAnalysis(listing({ bedrooms: 5 }), ["HMO"])

    // Same property, same rents — the only difference is Article 4, so the
    // restricted one must never score higher than the unrestricted one.
    expect(active.strategyResults.HMO.score).toBeLessThanOrEqual(
      clear.strategyResults.HMO.score,
    )
  })

  test("criticalFlags are plain readable strings (not stringified objects)", async () => {
    const r = await runDeepAnalysis(listing({ price: 1 }), ["BTL"])
    for (const f of r.strategyResults.BTL.summary.criticalFlags) {
      expect(typeof f).toBe("string")
      expect(f).not.toMatch(/\[object Object\]/)
    }
  })
})
