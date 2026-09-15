import { describe, expect, test, afterEach, vi } from "vitest"
import { isLicensingCheckerEnabled } from "@/lib/licensing/flag"
import { analyzerApiUrl, analyzerAuthHeaders, licensingCheckUrl, postLicensingCheck } from "@/lib/licensing/flask"
import { displayTrafficLight, licensingBadgeFromCheck, mapFlaskLicensingResponse, overallTrafficLight } from "@/lib/licensing/map"
import {
  buildFlaskLicensingPayload,
  conversionFromC3FromAnalyse,
  licensingInputFromAnalyse,
  purposeBuiltFlatFromAnalyse,
  toFlaskIntendedUse,
} from "@/lib/licensing/request"
import {
  FORBIDDEN_CLEARANCE_PHRASES,
  TRAFFIC_LIGHTS,
  type LicensingCheckResult,
} from "@/lib/licensing/types"
import { screenListing, type ListingCandidate } from "@/lib/discovery/tier1Screen"
import type { PropertyFormData } from "@/lib/types"

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

function flagOf(r: LicensingCheckResult, id: string) {
  const f = r.flags.find((x) => x.id === id)
  expect(f).toBeTruthy()
  return f!
}

function assertNoPositiveClearance(r: LicensingCheckResult) {
  expect(r.legalClearance).toBe(false)
  expect(r.overallTrafficLight).not.toBe("green")
  const scanned = [r.overallLabel, ...r.flags.map((f) => f.summary)].join("\n").toLowerCase()
  for (const phrase of FORBIDDEN_CLEARANCE_PHRASES) {
    expect(scanned, `flag copy must not claim “${phrase}”`).not.toContain(phrase)
  }
  expect(r.disclaimer.toLowerCase()).toMatch(/not legal advice|never grants legal clearance/)
  expect(r.banners.some((b) => b.id === "planning_data_a4_incomplete")).toBe(true)
  expect(r.banners.some((b) => b.id === "not_legal_clearance")).toBe(true)
  for (const f of r.flags) {
    expect(TRAFFIC_LIGHTS.includes(f.trafficLight)).toBe(true)
    expect(f.trafficLight).not.toBe("green")
  }
}

function flaskFlag(over: Record<string, unknown> = {}) {
  return {
    id: "mandatory_hmo",
    category: "licence",
    title: "Mandatory HMO licensing",
    summary: "England prescribed-description HMO may require a licence.",
    severity: "compliance_cost",
    severity_class: "compliance_cost",
    deal_impact: "compliance_cost",
    applies: "yes",
    confidence: 0.9,
    confidence_band: "high",
    sources: [{ name: "MHCLG", kind: "legislation", url: "https://example.com" }],
    analyse_hooks: [],
    freshness: { last_verified_at: "2018-10-01T00:00:00Z", stale: false },
    ...over,
  }
}

function flaskOk(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    api_version: "v1",
    feature_flag: "licensing_checker_v1",
    checked_at: "2026-09-14T12:00:00Z",
    disclaimer: {
      version: "licensing-checker-disclaimer-v1",
      text: "Indicative England-only licensing and planning flags for research. Not legal advice, not a CON29, and not a substitute for the local authority.",
    },
    location: {
      postcode: "E6 2RU",
      postcode_outward: "E6",
      postcode_inward: "2RU",
      la_name: "Newham",
      la_code: "E09000025",
      country: "England",
    },
    inputs: { postcode: "E6 2RU" },
    deal_impact: {
      level: "compliance_cost",
      verdict: "compliance_cost",
      killers: [],
      drivers: [],
      fee_hooks: [],
      estimated_licence_fees_gbp: { min: 500, max: 1500, known: true, items: [] },
      analyse_hooks: { add_capex_lines: [], add_risk_notes: [] },
    },
    freshness: { stale: false },
    flags: [flaskFlag()],
    warnings: [],
    ...over,
  }
}

function analyseForm(over: Partial<PropertyFormData> = {}): PropertyFormData {
  return {
    address: "1 Test Road",
    postcode: "E6 2RU",
    purchasePrice: 250000,
    propertyType: "house",
    investmentType: "hmo",
    bedrooms: 6,
    condition: "good",
    buyerType: "individual",
    refurbishmentBudget: 0,
    legalFees: 0,
    surveyCosts: 0,
    purchaseType: "mortgage",
    depositPercentage: 25,
    interestRate: 5,
    mortgageTerm: 25,
    mortgageType: "repayment",
    roomCount: 6,
    ...over,
  } as PropertyFormData
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

describe("FE-F2 display mapping from severity_class", () => {
  test("deal_killer + applies yes|possible is red, never green", () => {
    expect(displayTrafficLight({ applies: "yes", severity_class: "deal_killer" })).toBe("red")
    expect(displayTrafficLight({ applies: "possible", severity_class: "deal_killer" })).toBe("red")
    expect(displayTrafficLight({ applies: "conditional", severity_class: "deal_killer" })).toBe("red")
  })

  test("compliance_cost applies yes is amber", () => {
    expect(displayTrafficLight({ applies: "yes", severity_class: "compliance_cost" })).toBe("amber")
  })

  test("possible/conditional non-killers stay amber (A4 miss is not a green)", () => {
    expect(displayTrafficLight({ applies: "possible", severity_class: "soft_warning" })).toBe("amber")
    expect(displayTrafficLight({ applies: "conditional", severity_class: "info" })).toBe("amber")
  })

  test("applies no is grey, not a false green carve-out", () => {
    expect(displayTrafficLight({ applies: "no", severity_class: "info" })).toBe("grey")
    expect(displayTrafficLight({ applies: "no", severity_class: "compliance_cost" })).toBe("grey")
  })

  test("info applies yes is grey", () => {
    expect(displayTrafficLight({ applies: "yes", severity_class: "info" })).toBe("grey")
  })

  test("overall never promotes absence to green", () => {
    expect(overallTrafficLight([{ trafficLight: "grey" }, { trafficLight: "grey" }])).toBe("grey")
    expect(
      overallTrafficLight([{ trafficLight: "amber" }], { level: "soft_warning" } as never),
    ).toBe("amber")
    expect(
      overallTrafficLight([{ trafficLight: "red" }], {
        level: "deal_killer",
        killers: [{ flag_id: "article4" }],
      } as never),
    ).toBe("red")
  })
})

describe("mapFlaskLicensingResponse", () => {
  test("maps Flask success, keeps disclaimer, A4 banner, legalClearance false", () => {
    const r = mapFlaskLicensingResponse(flaskOk())
    expect(r.ok).toBe(true)
    expect(r.legalClearance).toBe(false)
    expect(r.location.council).toBe("Newham")
    expect(r.dealImpact?.estimated_licence_fees_gbp.min).toBe(500)
    expect(flagOf(r, "mandatory_hmo").severityClass).toBe("compliance_cost")
    expect(flagOf(r, "mandatory_hmo").trafficLight).toBe("amber")
    expect(r.overallTrafficLight).toBe("amber")
    assertNoPositiveClearance(r)
  })

  test("Article 4 miss (possible) stays amber, not green", () => {
    const r = mapFlaskLicensingResponse(
      flaskOk({
        flags: [
          flaskFlag({
            id: "article4_hmo",
            title: "Article 4 (HMO)",
            summary: "No planning.data.gov.uk hit. Coverage is partial; not evidence of no direction.",
            applies: "possible",
            severity_class: "soft_warning",
            severity: "soft_warning",
          }),
        ],
        deal_impact: { level: "soft_warning", verdict: "soft_warning", killers: [], analyse_hooks: { add_capex_lines: [], add_risk_notes: [] }, estimated_licence_fees_gbp: { known: false, min: null, max: null, items: [] } },
      }),
    )
    expect(flagOf(r, "article4_hmo").trafficLight).toBe("amber")
    expect(r.overallTrafficLight).toBe("amber")
    expect(r.overallTrafficLight).not.toBe("green")
    assertNoPositiveClearance(r)
  })

  test("Scotland is England-first grey coverage", () => {
    const r = mapFlaskLicensingResponse(
      flaskOk({
        location: {
          postcode: "EH1 1YZ",
          postcode_outward: "EH1",
          postcode_inward: "1YZ",
          la_name: "City of Edinburgh",
          country: "Scotland",
        },
        flags: [
          flaskFlag({
            id: "out_of_scope_nation",
            title: "Out of scope",
            summary: "Resolved country is Scotland; England statutory rules are not applied.",
            applies: "yes",
            severity_class: "info",
            severity: "info",
          }),
        ],
      }),
    )
    expect(r.coverage.supported).toBe(false)
    expect(r.banners.some((b) => b.id === "england_first")).toBe(true)
    expect(r.flags.every((f) => f.trafficLight === "grey")).toBe(true)
    expect(r.overallTrafficLight).toBe("grey")
    assertNoPositiveClearance(r)
  })

  test("deal_killer conversion + A4 possible is overall red", () => {
    const r = mapFlaskLicensingResponse(
      flaskOk({
        flags: [
          flaskFlag({
            id: "article4_hmo",
            title: "Article 4 C3→C4",
            summary: "Conversion play: Article 4 may apply. Planning permission may be required.",
            applies: "possible",
            severity_class: "deal_killer",
            severity: "deal_killer",
            deal_impact: "deal_killer",
          }),
        ],
        deal_impact: {
          level: "deal_killer",
          verdict: "deal_killer",
          killers: [{ flag_id: "article4_hmo", title: "Article 4 C3→C4", applies: "possible" }],
          analyse_hooks: {
            add_capex_lines: [{ id: "fee", label: "Additional HMO licence", min_gbp: 800, max_gbp: 1200 }],
            add_risk_notes: [{ id: "planning.c3_to_c4", summary: "C3→C4 conversion may need planning." }],
          },
          estimated_licence_fees_gbp: { min: 800, max: 1200, known: true, items: [] },
        },
      }),
    )
    expect(flagOf(r, "article4_hmo").trafficLight).toBe("red")
    expect(r.overallTrafficLight).toBe("red")
    expect(r.dealImpact?.analyse_hooks.add_capex_lines[0]?.min_gbp).toBe(800)
    expect(r.dealImpact?.analyse_hooks.add_risk_notes[0]?.summary).toMatch(/conversion/i)
    assertNoPositiveClearance(r)
  })

  test("purpose-built applies=no stays grey, not a false green", () => {
    const r = mapFlaskLicensingResponse(
      flaskOk({
        flags: [
          flaskFlag({
            id: "mandatory_hmo",
            summary: "Purpose-built flat in a block of 3+ is carved out of mandatory HMO.",
            applies: "no",
            severity_class: "info",
          }),
        ],
        deal_impact: { level: "info", verdict: "info", killers: [], analyse_hooks: { add_capex_lines: [], add_risk_notes: [] }, estimated_licence_fees_gbp: { known: false, min: null, max: null, items: [] } },
      }),
    )
    expect(flagOf(r, "mandatory_hmo").trafficLight).toBe("grey")
    expect(r.overallTrafficLight).toBe("grey")
    assertNoPositiveClearance(r)
  })

  test("stale freshness adds a stale banner", () => {
    const r = mapFlaskLicensingResponse(flaskOk({ freshness: { stale: true, stale_components: ["additional_hmo"] } }))
    expect(r.banners.some((b) => b.id === "stale_data")).toBe(true)
  })

  test("badge helper is display-only and never says cleared", () => {
    const r = mapFlaskLicensingResponse(flaskOk())
    const model = licensingBadgeFromCheck(r)
    expect(model.trafficLight).toBe("amber")
    expect(model.label.toLowerCase()).not.toMatch(/clear/)
  })
})

describe("FE-F3/F5 request builder", () => {
  test("HMO Analyse sends conversion_from_c3 true and occupancy, not rooms", () => {
    const input = licensingInputFromAnalyse(analyseForm({ investmentType: "hmo", roomCount: 6 }))
    expect(input.conversionFromC3).toBe(true)
    expect(input.intendedUse).toBe("hmo")
    expect(input.occupants).toBe(6)
    expect(input.households).toBe(6)
    expect(input.sharingAmenities).toBe(true)
    const payload = buildFlaskLicensingPayload(input)
    expect(payload.conversion_from_c3).toBe(true)
    expect(payload.intended_use).toBe("hmo")
    expect(payload.occupants).toBe(6)
    expect(payload).not.toHaveProperty("rooms")
    expect(payload).not.toHaveProperty("skip_article4")
  })

  test("BRR HMO exit is a conversion play", () => {
    expect(
      conversionFromC3FromAnalyse({ investmentType: "brr", brrrExitStrategy: "hmo" }),
    ).toBe(true)
    const input = licensingInputFromAnalyse(
      analyseForm({ investmentType: "brr", brrrExitStrategy: "hmo", roomCount: 5 }),
    )
    expect(input.conversionFromC3).toBe(true)
    expect(input.intendedUse).toBe("hmo")
  })

  test("BTL / SA / flip send conversion_from_c3 false and do not treat bedrooms as occupants", () => {
    const btl = licensingInputFromAnalyse(analyseForm({ investmentType: "btl", bedrooms: 3, roomCount: undefined }))
    expect(btl.conversionFromC3).toBe(false)
    expect(btl.occupants).toBeFalsy()
    expect(buildFlaskLicensingPayload(btl).intended_use).toBe("btl")

    const sa = licensingInputFromAnalyse(analyseForm({ investmentType: "r2sa" }))
    expect(sa.conversionFromC3).toBe(false)
    expect(toFlaskIntendedUse(sa.intendedUse)).toBe("sa")

    const flip = licensingInputFromAnalyse(analyseForm({ investmentType: "flip" }))
    expect(flip.conversionFromC3).toBe(false)
    expect(toFlaskIntendedUse(flip.intendedUse)).toBe("unknown")
  })

  test("house → purpose_built_flat false; generic flat omits the field", () => {
    expect(purposeBuiltFlatFromAnalyse({ propertyType: "house" })).toBe(false)
    expect(purposeBuiltFlatFromAnalyse({ propertyType: "flat" })).toBeUndefined()
    const house = buildFlaskLicensingPayload(licensingInputFromAnalyse(analyseForm({ propertyType: "house" })))
    expect(house.purpose_built_flat).toBe(false)
    expect(house).not.toHaveProperty("flats_in_block")
    const flat = buildFlaskLicensingPayload(
      licensingInputFromAnalyse(analyseForm({ propertyType: "flat" })),
    )
    expect(flat).not.toHaveProperty("purpose_built_flat")
    expect(flat).not.toHaveProperty("flats_in_block")
  })

  test("rooms is occupants fallback only", () => {
    const payload = buildFlaskLicensingPayload({
      postcode: "M14 5AA",
      rooms: 4,
      intendedUse: "hmo",
    })
    expect(payload.occupants).toBe(4)
    expect(payload).not.toHaveProperty("rooms")
  })
})

describe("FE-F1 Flask proxy client", () => {
  const origUrl = process.env.ANALYZER_API_URL
  const origBackend = process.env.BACKEND_API_URL
  const origToken = process.env.ANALYZER_API_TOKEN

  afterEach(() => {
    if (origUrl === undefined) delete process.env.ANALYZER_API_URL
    else process.env.ANALYZER_API_URL = origUrl
    if (origBackend === undefined) delete process.env.BACKEND_API_URL
    else process.env.BACKEND_API_URL = origBackend
    if (origToken === undefined) delete process.env.ANALYZER_API_TOKEN
    else process.env.ANALYZER_API_TOKEN = origToken
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test("ANALYZER_API_URL wins over BACKEND_API_URL", () => {
    process.env.BACKEND_API_URL = "https://backend.example"
    process.env.ANALYZER_API_URL = "https://analyzer.example/"
    expect(analyzerApiUrl()).toBe("https://analyzer.example")
    expect(licensingCheckUrl()).toBe("https://analyzer.example/v1/licensing/check")
  })

  test("sends Bearer when ANALYZER_API_TOKEN is set", () => {
    process.env.ANALYZER_API_TOKEN = "secret-token"
    expect(analyzerAuthHeaders().Authorization).toBe("Bearer secret-token")
  })

  test("POSTs JSON to Flask /v1/licensing/check with Bearer", async () => {
    process.env.ANALYZER_API_URL = "https://analyzer.example"
    process.env.ANALYZER_API_TOKEN = "tok"
    const fetchMock = vi.fn(async () => ({
      status: 200,
      json: async () => flaskOk(),
    }))
    vi.stubGlobal("fetch", fetchMock)
    const { status, json } = await postLicensingCheck({
      postcode: "E6 2RU",
      conversion_from_c3: true,
    })
    expect(status).toBe(200)
    expect((json as { ok: boolean }).ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://analyzer.example/v1/licensing/check",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        body: JSON.stringify({
          postcode: "E6 2RU",
          conversion_from_c3: true,
        }),
      }),
    )
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
