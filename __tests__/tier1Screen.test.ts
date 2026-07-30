/**
 * Tier 1 screen — behaviour + honesty-rule tests.
 *
 * getDistrictIntel is mocked so these are pure and fast (and prove the
 * screener makes no live calls of its own).
 */
import { describe, expect, test, vi, beforeEach } from "vitest"

const intel = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))

vi.mock("@/lib/discovery/areaIntel", () => ({
  toDistrict: (pc: string) => (pc || "").trim().toUpperCase().split(/\s+/)[0],
  getDistrictIntel: vi.fn(async () => intel.current),
  resetDistrictIntelCache: vi.fn(),
}))

import { screenListing, type ListingCandidate } from "@/lib/discovery/tier1Screen"

function setIntel(over: Record<string, unknown> = {}) {
  intel.current = {
    district: "M14",
    medianSoldPrice: 250000,
    medianMonthlyRent: 1200,
    medianRoomRent: 550,
    medianBtlGrossYield: null,
    medianHmoGrossYield: null,
    medianSaMonthlyRevenue: null,
    dominantStrategy: "hmo",
    confidenceLevel: "high",
    article4: { status: "none" },
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
    bedrooms: 3,
    propertyType: "house",
    thumbnailUrl: null,
    description: "A lovely family home",
    ...over,
  }
}

beforeEach(() => setIntel())

describe("Tier 1 — yield + BMV signals", () => {
  test("computes BMV% and gross yield from area data", async () => {
    const r = await screenListing(listing(), ["BTL"])
    // (250k - 200k) / 250k = 20%
    expect(r.signals.bmvPct).toBe(20)
    // 1200*12 / 200k = 7.2%
    expect(r.signals.estimatedGrossYield).toBe(7.2)
    expect(r.strategySignals.find((s) => s.strategy === "BTL")?.signal).toBe("strong")
    expect(r.passesThreshold).toBe(true)
  })

  test("BRRRR is strong only when BMV >= 15% AND refurb language present", async () => {
    const plain = await screenListing(listing(), ["BRRRR"])
    expect(plain.strategySignals.find((s) => s.strategy === "BRRRR")?.signal).toBe("moderate")

    const refurb = await screenListing(
      listing({ description: "Requires modernisation throughout. No onward chain." }),
      ["BRRRR"],
    )
    expect(refurb.signals.hasRefurbLanguage).toBe(true)
    expect(refurb.strategySignals.find((s) => s.strategy === "BRRRR")?.signal).toBe("strong")
  })

  test("HMO room potential adds a room below 5 beds, takes 5+ at face value", async () => {
    const three = await screenListing(listing({ bedrooms: 3 }), ["HMO"])
    expect(three.signals.roomPotential).toBe(4)
    const five = await screenListing(listing({ bedrooms: 5 }), ["HMO"])
    expect(five.signals.roomPotential).toBe(5)
  })
})

describe("Tier 1 — honesty rules", () => {
  test("ACTIVE Article 4 downgrades HMO to weak and says why (never hidden)", async () => {
    setIntel({ article4: { status: "active" } })
    const r = await screenListing(listing({ bedrooms: 5 }), ["HMO"])
    const hmo = r.strategySignals.find((s) => s.strategy === "HMO")
    expect(hmo?.signal).toBe("weak")
    expect(hmo?.reason).toMatch(/Article 4 in force/i)
    expect(r.signals.article4Status).toBe("active")
  })

  test("UNKNOWN Article 4 is reported as unknown, not 'none'", async () => {
    setIntel({ article4: { status: "unknown" } })
    const r = await screenListing(listing({ bedrooms: 5 }), ["HMO"])
    expect(r.signals.article4Status).toBe("unknown")
    expect(r.strategySignals.find((s) => s.strategy === "HMO")?.reason).toMatch(
      /unconfirmed/i,
    )
  })

  test("missing area data → null metric, no signal raised, gap declared", async () => {
    setIntel({ medianSoldPrice: null, medianMonthlyRent: null, medianBtlGrossYield: null })
    const r = await screenListing(listing(), ["BTL", "BRRRR"])
    expect(r.signals.bmvPct).toBeNull()
    expect(r.signals.estimatedGrossYield).toBeNull()
    expect(r.strategySignals.find((s) => s.strategy === "BTL")).toBeUndefined()
    expect(r.signals.missingData).toContain("area median sale price")
    expect(r.signals.missingData).toContain("area rent / BTL yield")
    expect(r.passesThreshold).toBe(false)
  })

  test("refurb language alone is weak, and says the BMV is unconfirmed", async () => {
    setIntel({ medianSoldPrice: null })
    const r = await screenListing(
      listing({ description: "Renovation project, cash buyers only" }),
      ["BRRRR"],
    )
    const brrrr = r.strategySignals.find((s) => s.strategy === "BRRRR")
    expect(brrrr?.signal).toBe("weak")
    expect(brrrr?.reason).toMatch(/no area price benchmark/i)
  })
})

describe("Tier 1 — thresholds and scoring", () => {
  test("one strong signal passes; a single moderate does not", async () => {
    setIntel({ medianMonthlyRent: 800 }) // 800*12/200k = 4.8% → moderate BTL
    const r = await screenListing(listing(), ["BTL"])
    expect(r.strategySignals).toHaveLength(1)
    expect(r.strategySignals[0].signal).toBe("moderate")
    expect(r.passesThreshold).toBe(false)
    expect(r.score).toBe(15)
  })

  test("two moderate signals pass the threshold", async () => {
    setIntel({ medianMonthlyRent: 800, medianSoldPrice: 230000 }) // ~13% BMV
    const r = await screenListing(listing(), ["BTL", "BRRRR"])
    expect(r.strategySignals.filter((s) => s.signal === "moderate")).toHaveLength(2)
    expect(r.passesThreshold).toBe(true)
    expect(r.score).toBe(30)
  })

  test("only requested strategies are screened", async () => {
    const r = await screenListing(listing({ bedrooms: 5 }), ["BTL"])
    expect(r.strategySignals.every((s) => s.strategy === "BTL")).toBe(true)
    expect(r.signals.estimatedHmoYield).toBeNull()
  })

  test("score caps at 100", async () => {
    setIntel({ medianMonthlyRent: 3000, medianRoomRent: 900, medianSaMonthlyRevenue: 4000 })
    const r = await screenListing(
      listing({ bedrooms: 5, description: "requires modernisation" }),
      ["BTL", "HMO", "BRRRR", "SA", "FLIP"],
    )
    expect(r.score).toBeLessThanOrEqual(100)
  })
})
