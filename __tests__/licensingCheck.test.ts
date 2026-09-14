import { describe, expect, test, afterEach, vi } from "vitest"
import { checkLicensing, licensingBadgeFromCheck } from "@/lib/licensing/check"
import { isLicensingCheckerEnabled } from "@/lib/licensing/flag"
import { matchCouncilRecord, normaliseCouncilName } from "@/lib/licensing/schemes"
import {
  FORBIDDEN_CLEARANCE_PHRASES,
  TRAFFIC_LIGHTS,
  type LicensingCheckResult,
} from "@/lib/licensing/types"
import type { Article4CheckResult } from "@/lib/article4-service"
import { screenListing, type ListingCandidate } from "@/lib/discovery/tier1Screen"

vi.mock("@/lib/discovery/areaIntel", () => ({
  toDistrict: (pc: string) => (pc || "").trim().toUpperCase().split(/\s+/)[0],
  getDistrictIntel: vi.fn(async () => ({
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
  })),
  resetDistrictIntelCache: vi.fn(),
}))

function a4(over: Partial<Article4CheckResult> = {}): Article4CheckResult {
  return {
    isArticle4: false,
    status: "none",
    areas: [],
    warningLevel: "none",
    summary: "No HMO Article 4 direction found.",
    district: "M14",
    sector: "M14 5",
    ...over,
  }
}

function flagOf(r: LicensingCheckResult, id: string) {
  const f = r.flags.find((x) => x.id === id)
  expect(f).toBeTruthy()
  return f!
}

function assertNoPositiveClearance(r: LicensingCheckResult) {
  expect(r.legalClearance).toBe(false)
  const scanned = [r.overallLabel, ...r.flags.map((f) => f.summary)].join("\n").toLowerCase()
  for (const phrase of FORBIDDEN_CLEARANCE_PHRASES) {
    expect(scanned, `flag copy must not claim “${phrase}”`).not.toContain(phrase)
  }
  expect(r.disclaimer.toLowerCase()).toMatch(/not legal advice|never grants legal clearance/)
  expect(r.banners.some((b) => b.id === "planning_data_a4_incomplete")).toBe(true)
  expect(r.banners.some((b) => b.id === "not_legal_clearance")).toBe(true)
  for (const f of r.flags) {
    expect(TRAFFIC_LIGHTS.includes(f.trafficLight)).toBe(true)
  }
}

describe("licensing_checker_v1 flag", () => {
  const orig = process.env.NEXT_PUBLIC_LICENSING_CHECKER_V1
  afterEach(() => {
    if (orig === undefined) delete process.env.NEXT_PUBLIC_LICENSING_CHECKER_V1
    else process.env.NEXT_PUBLIC_LICENSING_CHECKER_V1 = orig
  })

  test("defaults ON when unset", () => {
    delete process.env.NEXT_PUBLIC_LICENSING_CHECKER_V1
    expect(isLicensingCheckerEnabled()).toBe(true)
  })

  test("turns OFF for false/0/off", () => {
    process.env.NEXT_PUBLIC_LICENSING_CHECKER_V1 = "false"
    expect(isLicensingCheckerEnabled()).toBe(false)
    process.env.NEXT_PUBLIC_LICENSING_CHECKER_V1 = "0"
    expect(isLicensingCheckerEnabled()).toBe(false)
  })
})

describe("council matching", () => {
  test("normalises London borough prefixes", () => {
    expect(normaliseCouncilName("London Borough of Newham")).toBe("newham")
    expect(matchCouncilRecord("London Borough of Newham")?.name).toBe("Newham")
  })

  test("Manchester is a partial (amber) match, not a false green", async () => {
    expect(matchCouncilRecord("Manchester")?.schemes.every((s) => s.coverage === "partial")).toBe(
      true,
    )
  })

  test("unknown councils do not match", () => {
    expect(matchCouncilRecord("West Berkshire")).toBeNull()
  })
})

describe("checkLicensing", () => {
  test("invalid postcode is grey and unsupported", async () => {
    const r = await checkLicensing(
      { postcode: "not-a-postcode" },
      {
        geocode: async () => null,
        checkArticle4: async () => a4(),
      },
    )
    expect(r.coverage.supported).toBe(false)
    expect(r.overallTrafficLight).toBe("grey")
    expect(r.flags).toHaveLength(4)
    assertNoPositiveClearance(r)
  })

  test("Scotland is England-first out of coverage (all grey)", async () => {
    const r = await checkLicensing(
      { postcode: "EH1 1YZ" },
      {
        geocode: async () => ({
          postcode: "EH1 1YZ",
          country: "Scotland",
          council: "City of Edinburgh",
          district: "EH1",
          sector: "EH1 1",
        }),
        checkArticle4: async () => a4(),
      },
    )
    expect(r.coverage.supported).toBe(false)
    expect(r.banners.some((b) => b.id === "england_first")).toBe(true)
    expect(r.flags.every((f) => f.trafficLight === "grey")).toBe(true)
    expect(r.flags.every((f) => f.status === "out_of_coverage")).toBe(true)
    assertNoPositiveClearance(r)
  })

  test("England + 5 occupants: mandatory red; Newham additional/selective red", async () => {
    const r = await checkLicensing(
      { postcode: "E6 2RU", occupants: 6, intendedUse: "hmo" },
      {
        geocode: async () => ({
          postcode: "E6 2RU",
          country: "England",
          council: "Newham",
          district: "E6",
          sector: "E6 2",
        }),
        checkArticle4: async () => a4({ district: "E6", sector: "E6 2" }),
      },
    )
    expect(r.coverage.supported).toBe(true)
    expect(flagOf(r, "mandatory_hmo").trafficLight).toBe("red")
    expect(flagOf(r, "additional_hmo").trafficLight).toBe("red")
    expect(flagOf(r, "selective").trafficLight).toBe("red")
    expect(flagOf(r, "article4_c3_c4").trafficLight).toBe("green")
    expect(r.overallTrafficLight).toBe("red")
    expect(r.banners.some((b) => b.id === "planning_data_a4_incomplete")).toBe(true)
    assertNoPositiveClearance(r)
  })

  test("occupancy below 5: mandatory green (not triggered), still not clearance", async () => {
    const r = await checkLicensing(
      { postcode: "RG1 1AA", occupants: 2, intendedUse: "btl" },
      {
        geocode: async () => ({
          postcode: "RG1 1AA",
          country: "England",
          council: "West Berkshire",
          district: "RG1",
          sector: "RG1 1",
        }),
        checkArticle4: async () => a4({ district: "RG1" }),
      },
    )
    expect(flagOf(r, "mandatory_hmo").trafficLight).toBe("green")
    expect(flagOf(r, "mandatory_hmo").status).toBe("not_triggered")
    // Unmatched council must stay grey, never a fake "no scheme".
    expect(flagOf(r, "additional_hmo").trafficLight).toBe("grey")
    expect(flagOf(r, "selective").trafficLight).toBe("grey")
    assertNoPositiveClearance(r)
  })

  test("partial council schemes are amber, not red", async () => {
    const r = await checkLicensing(
      { postcode: "M14 5AA", intendedUse: "hmo" },
      {
        geocode: async () => ({
          postcode: "M14 5AA",
          country: "England",
          council: "Manchester",
          district: "M14",
          sector: "M14 5",
        }),
        checkArticle4: async () => a4(),
      },
    )
    expect(flagOf(r, "additional_hmo").trafficLight).toBe("amber")
    expect(flagOf(r, "selective").trafficLight).toBe("amber")
    expect(flagOf(r, "mandatory_hmo").trafficLight).toBe("amber") // occupancy unknown
    assertNoPositiveClearance(r)
  })

  test("active Article 4 is red with incomplete-data banner still present", async () => {
    const r = await checkLicensing(
      { postcode: "M14 5AA" },
      {
        geocode: async () => ({
          postcode: "M14 5AA",
          country: "England",
          council: "Manchester",
          district: "M14",
          sector: "M14 5",
        }),
        checkArticle4: async () =>
          a4({
            isArticle4: true,
            status: "active",
            warningLevel: "red",
            summary: "ARTICLE 4 IN FORCE: Manchester",
          }),
      },
    )
    expect(flagOf(r, "article4_c3_c4").trafficLight).toBe("red")
    expect(r.banners.some((b) => b.id === "planning_data_a4_incomplete")).toBe(true)
    assertNoPositiveClearance(r)
  })

  test("badge helper is display-only and never says cleared", () => {
    const model = licensingBadgeFromCheck({
      ok: true,
      legalClearance: false,
      disclaimer: "x",
      coverage: { nation: "England", supported: true, englandFirst: true },
      location: {
        postcode: "E6 2RU",
        district: "E6",
        sector: "E6 2",
        council: "Newham",
        country: "England",
      },
      banners: [],
      flags: [
        {
          id: "mandatory_hmo",
          label: "Mandatory HMO licensing",
          trafficLight: "red",
          severity: "high",
          confidence: "high",
          status: "in_force",
          summary: "test",
          freshness: { asOf: "2026-09-14", sourceUpdatedAt: null, label: "x" },
          sources: [],
        },
      ],
      overallTrafficLight: "red",
      overallLabel: "Licence or planning restriction indicated — verify before proceeding",
      checkedAt: new Date().toISOString(),
      flag: "licensing_checker_v1",
    })
    expect(model.trafficLight).toBe("red")
    expect(model.label.toLowerCase()).not.toMatch(/clear/)
  })
})

describe("screener does not hard-filter on licensing", () => {
  test("Tier 1 never attaches a licensing field and still passes HMO listings", async () => {
    const listing: ListingCandidate = {
      listingUrl: "https://www.rightmove.co.uk/properties/1",
      listingId: "1",
      address: "1 Test Road, Manchester",
      postcode: "M14 5AA",
      price: 200000,
      bedrooms: 5,
      propertyType: "house",
      thumbnailUrl: null,
      description: "A lovely family home",
    }
    const r = await screenListing(listing, ["HMO"])
    expect((r.signals as { licensing?: unknown }).licensing).toBeUndefined()
    expect(r.passesThreshold).toBe(true)
  })
})
