/**
 * Comps & Valuation engine (layer 4).
 *
 * The engine is deterministic by design, so these are real assertions on the
 * arithmetic — not smoke tests. Selection (PostGIS) is verified separately
 * against the live database.
 */
import { describe, it, expect } from "vitest"
import {
  valueFromComps,
  similarityScore,
  bedroomGradient,
  weightedMedian,
  typeFamily,
  monthsBetween,
  MIN_COMPS_FOR_VALUATION,
  type RawComp,
  type SubjectProperty,
} from "@/lib/discovery/comps"

/** A sold comp, `monthsAgo` months in the past. */
function comp(over: Partial<RawComp> & { monthsAgo?: number } = {}): RawComp {
  const monthsAgo = over.monthsAgo ?? 3
  const d = new Date()
  d.setMonth(d.getMonth() - monthsAgo)
  return {
    saleId: Math.random().toString(36).slice(2),
    propertyId: "p1",
    address: "1 TEST ST",
    postcode: "M13 9PL",
    distanceM: 200,
    soldPrice: 200_000,
    soldDate: d.toISOString().slice(0, 10),
    bedrooms: 3,
    propertyType: "Terraced",
    floorAreaSqft: null,
    source: "rightmove_sold",
    ...over,
  }
}

const SUBJECT: SubjectProperty = {
  latitude: 53.4631,
  longitude: -2.2339,
  bedrooms: 3,
  propertyType: "Terraced",
  askingPrice: 215_000,
}

describe("helpers", () => {
  it("weightedMedian respects weight, not just value", () => {
    // Heavily weighted low value pulls the median down to it.
    expect(
      weightedMedian([
        { value: 100, weight: 10 },
        { value: 200, weight: 1 },
        { value: 300, weight: 1 },
      ]),
    ).toBe(100)
  })

  it("weightedMedian ignores zero-weight and returns null when empty", () => {
    expect(weightedMedian([{ value: 100, weight: 0 }])).toBeNull()
    expect(weightedMedian([])).toBeNull()
  })

  it("typeFamily groups real-world labels", () => {
    expect(typeFamily("Semi-Detached House")).toBe("semi")
    expect(typeFamily("Detached House")).toBe("detached")
    expect(typeFamily("End of Terrace")).toBe("terraced")
    expect(typeFamily("Purpose Built Flat")).toBe("flat")
    // "semi-detached" must not be read as "detached"
    expect(typeFamily("Semi-Detached")).not.toBe("detached")
  })

  it("monthsBetween handles a garbage date without throwing", () => {
    expect(monthsBetween("not-a-date")).toBe(999)
  })
})

describe("similarityScore", () => {
  const opts = { radiusM: 1600, months: 24 }

  it("ranks a near, recent, identical comp above a far, old, different one", () => {
    const good = similarityScore(
      { distanceM: 50, bedrooms: 3, propertyType: "Terraced", monthsAgo: 1 },
      SUBJECT,
      opts,
    )
    const bad = similarityScore(
      { distanceM: 1500, bedrooms: 5, propertyType: "Detached", monthsAgo: 23 },
      SUBJECT,
      opts,
    )
    expect(good).toBeGreaterThan(bad)
  })

  it("penalises bedroom mismatch monotonically", () => {
    const base = { distanceM: 100, propertyType: "Terraced", monthsAgo: 1 }
    const exact = similarityScore({ ...base, bedrooms: 3 }, SUBJECT, opts)
    const off1 = similarityScore({ ...base, bedrooms: 4 }, SUBJECT, opts)
    const off2 = similarityScore({ ...base, bedrooms: 5 }, SUBJECT, opts)
    expect(exact).toBeGreaterThan(off1)
    expect(off1).toBeGreaterThan(off2)
  })

  it("never returns zero, so a distant comp still counts a little", () => {
    const s = similarityScore(
      { distanceM: 99_999, bedrooms: 9, propertyType: "Flat", monthsAgo: 999 },
      SUBJECT,
      opts,
    )
    expect(s).toBeGreaterThan(0)
  })
})

describe("bedroomGradient", () => {
  it("infers a per-bedroom price gradient from the comp set", () => {
    const comps = [
      comp({ bedrooms: 2, soldPrice: 150_000 }),
      comp({ bedrooms: 3, soldPrice: 200_000 }),
      comp({ bedrooms: 4, soldPrice: 250_000 }),
    ]
    expect(bedroomGradient(comps)).toBe(50_000)
  })

  it("returns null when comps don't span bedroom counts", () => {
    expect(bedroomGradient([comp({ bedrooms: 3 }), comp({ bedrooms: 3 })])).toBeNull()
  })

  it("returns null rather than a negative gradient from noise", () => {
    const comps = [
      comp({ bedrooms: 2, soldPrice: 300_000 }),
      comp({ bedrooms: 4, soldPrice: 100_000 }),
    ]
    expect(bedroomGradient(comps)).toBeNull()
  })
})

describe("valueFromComps", () => {
  it("returns no valuation when there are no comps", () => {
    const v = valueFromComps(SUBJECT, [])
    expect(v.arv).toBeNull()
    expect(v.confidence).toBe("none")
    expect(v.compCount).toBe(0)
  })

  it("refuses to publish an ARV below the minimum comp count", () => {
    const v = valueFromComps(SUBJECT, [comp(), comp()])
    expect(v.compCount).toBe(2)
    expect(v.arv).toBeNull()
    expect(v.confidence).toBe("low")
    expect(v.adjustments.join(" ")).toMatch(
      new RegExp(`below the ${MIN_COMPS_FOR_VALUATION}`),
    )
  })

  it("derives an ARV in the right region from a tight comp set", () => {
    const comps = [
      comp({ soldPrice: 198_000 }),
      comp({ soldPrice: 200_000 }),
      comp({ soldPrice: 202_000 }),
      comp({ soldPrice: 205_000 }),
      comp({ soldPrice: 195_000 }),
    ]
    const v = valueFromComps(SUBJECT, comps)
    expect(v.arv).toBeGreaterThan(190_000)
    expect(v.arv).toBeLessThan(210_000)
    expect(v.medianSoldPrice).toBe(200_000)
    expect(v.compCount).toBe(5)
  })

  it("is not dragged by a single wild outlier (median, not mean)", () => {
    const tight = [
      comp({ soldPrice: 200_000 }),
      comp({ soldPrice: 205_000 }),
      comp({ soldPrice: 195_000 }),
      comp({ soldPrice: 202_000 }),
      comp({ soldPrice: 198_000 }),
    ]
    const withOutlier = [...tight, comp({ soldPrice: 5_000_000, distanceM: 1500 })]
    const a = valueFromComps(SUBJECT, tight).arv!
    const b = valueFromComps(SUBJECT, withOutlier).arv!
    // A mean would have exploded; the median barely moves.
    expect(Math.abs(b - a)).toBeLessThan(20_000)
  })

  it("adjusts comps toward the subject's bedroom count", () => {
    // Subject is 3-bed; comps span 2/3/4 so a gradient is inferable.
    const comps = [
      comp({ bedrooms: 2, soldPrice: 150_000 }),
      comp({ bedrooms: 2, soldPrice: 152_000 }),
      comp({ bedrooms: 3, soldPrice: 200_000 }),
      comp({ bedrooms: 4, soldPrice: 250_000 }),
      comp({ bedrooms: 4, soldPrice: 248_000 }),
    ]
    const v = valueFromComps(SUBJECT, comps)
    // Every comp is restated as "what this implies for a 3-bed", so the
    // adjusted spread should cluster far tighter than the raw one.
    const rawSpread = 250_000 - 150_000
    const adjusted = v.comps.map((c) => c.adjustedPrice)
    const adjSpread = Math.max(...adjusted) - Math.min(...adjusted)
    expect(adjSpread).toBeLessThan(rawSpread)
    expect(v.adjustments.join(" ")).toMatch(/gradient/i)
  })

  it("says so when it cannot infer a bedroom gradient", () => {
    const comps = [comp(), comp(), comp(), comp()] // all 3-bed
    const v = valueFromComps(SUBJECT, comps)
    expect(v.adjustments.join(" ")).toMatch(/did not span enough bedroom counts/i)
  })

  it("computes £/sqft only from comps that reported a floor area", () => {
    const comps = [
      comp({ soldPrice: 200_000, floorAreaSqft: 1000 }), // £200
      comp({ soldPrice: 220_000, floorAreaSqft: 1000 }), // £220
      comp({ soldPrice: 210_000, floorAreaSqft: 1000 }), // £210
      comp({ soldPrice: 999_999, floorAreaSqft: null }), // ignored for £/sqft
    ]
    expect(valueFromComps(SUBJECT, comps).pricePerSqft).toBe(210)
  })

  it("flags when no comp reported a floor area", () => {
    const v = valueFromComps(SUBJECT, [comp(), comp(), comp()])
    expect(v.pricePerSqft).toBeNull()
    expect(v.adjustments.join(" ")).toMatch(/no comp reported a floor area/i)
  })

  it("rates a tight, plentiful comp set higher-confidence than a scattered one", () => {
    const tight = Array.from({ length: 8 }, (_, i) => comp({ soldPrice: 200_000 + i * 500 }))
    const scattered = Array.from({ length: 8 }, (_, i) => comp({ soldPrice: 120_000 + i * 40_000 }))
    const a = valueFromComps(SUBJECT, tight)
    const b = valueFromComps(SUBJECT, scattered)
    expect(a.confidence).toBe("high")
    expect(["low", "medium"]).toContain(b.confidence)
    expect(a.dispersionPct!).toBeLessThan(b.dispersionPct!)
  })

  it("expresses asking price as a discount to ARV", () => {
    const comps = Array.from({ length: 5 }, () => comp({ soldPrice: 250_000, bedrooms: 3 }))
    // Subject asking 215k against a ~250k ARV → roughly a 14% discount.
    const v = valueFromComps({ ...SUBJECT, askingPrice: 215_000 }, comps)
    expect(v.discountToArvPct).toBeGreaterThan(10)
    expect(v.discountToArvPct).toBeLessThan(20)
  })

  it("reports a negative discount when asking is above the comps", () => {
    const comps = Array.from({ length: 5 }, () => comp({ soldPrice: 180_000, bedrooms: 3 }))
    const v = valueFromComps({ ...SUBJECT, askingPrice: 215_000 }, comps)
    expect(v.discountToArvPct).toBeLessThan(0)
  })

  it("excludes zero-price sales and records why", () => {
    const v = valueFromComps(SUBJECT, [
      comp({ soldPrice: 200_000 }),
      comp({ soldPrice: 0, address: "BROKEN ST" }),
      comp({ soldPrice: 205_000 }),
      comp({ soldPrice: 195_000 }),
    ])
    expect(v.compCount).toBe(3)
    expect(v.excluded.join(" ")).toMatch(/BROKEN ST/)
  })

  it("orders returned comps by similarity, best first", () => {
    const v = valueFromComps(SUBJECT, [
      comp({ distanceM: 1500, bedrooms: 5, address: "FAR" }),
      comp({ distanceM: 50, bedrooms: 3, address: "NEAR" }),
      comp({ distanceM: 800, bedrooms: 3, address: "MID" }),
    ])
    expect(v.comps[0].address).toBe("NEAR")
    expect(v.comps[v.comps.length - 1].address).toBe("FAR")
  })

  it("is deterministic — same inputs, identical output", () => {
    const comps = [comp({ soldPrice: 200_000 }), comp({ soldPrice: 210_000 }), comp({ soldPrice: 190_000 })]
    const a = valueFromComps(SUBJECT, comps)
    const b = valueFromComps(SUBJECT, comps)
    expect(a.arv).toBe(b.arv)
    expect(a.confidence).toBe(b.confidence)
    expect(a.dispersionPct).toBe(b.dispersionPct)
  })
})
