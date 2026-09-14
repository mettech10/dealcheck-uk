/**
 * Backend calc API client + payload unwrap.
 */
import { describe, expect, test, vi, afterEach } from "vitest"
import {
  backendLtdCoUrl,
  fetchLtdCoCompare,
  isLtdCoCompareResult,
  mapBackendCompareToUi,
  toBackendComparePayload,
  unwrapLtdCoComparePayload,
} from "@/lib/ltdCoBackend"
import {
  BANNED_LEAN_PHRASES,
  comparePersonalVsLtd,
  DEFAULT_LTD_CO_INPUT,
  LTD_CO_DISCLAIMER_WALL,
  leanContainsBannedPhrase,
} from "@/lib/ltdCoCompare"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("unwrapLtdCoComparePayload", () => {
  test("accepts a native result and wrapped keys", () => {
    const native = comparePersonalVsLtd(DEFAULT_LTD_CO_INPUT)
    expect(isLtdCoCompareResult(native)).toBe(true)
    expect(unwrapLtdCoComparePayload(native)?.personal.year1AfterTax).toBe(
      native.personal.year1AfterTax,
    )
    expect(
      unwrapLtdCoComparePayload({ ltdCoCompare: native })?.retained.year1AfterTax,
    ).toBe(native.retained.year1AfterTax)
    expect(
      unwrapLtdCoComparePayload({ ltd_co_compare: native })?.extracted.copy,
    ).toBe(native.extracted.copy)
    expect(unwrapLtdCoComparePayload({ result: native })?.years.length).toBe(
      native.years.length,
    )
    expect(unwrapLtdCoComparePayload({ ok: true })).toBeNull()
  })
})

describe("fetchLtdCoCompare", () => {
  test("uses the backend payload when /v1/ltd-co/compare returns a valid result", async () => {
    const native = comparePersonalVsLtd(DEFAULT_LTD_CO_INPUT)
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, ltdCoCompare: native }),
    })
    const r = await fetchLtdCoCompare(DEFAULT_LTD_CO_INPUT, { fetchImpl })
    expect(r.source).toBe("backend")
    expect(r.ltdCoCompare.personal.year1AfterTax).toBe(native.personal.year1AfterTax)
    expect(String(fetchImpl.mock.calls[0][0])).toContain("/v1/ltd-co/compare")
  })

  test("falls back to the local engine when the BE route is missing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "not found" }),
    })
    const r = await fetchLtdCoCompare(DEFAULT_LTD_CO_INPUT, { fetchImpl })
    expect(r.source).toBe("local-fallback")
    expect(r.ltdCoCompare.flags.educationalOnly).toBe(true)
    expect(r.ltdCoCompare.years.length).toBeGreaterThan(0)
  })

  test("backend URL is Flask /v1/ltd-co/compare", () => {
    expect(backendLtdCoUrl("https://metusa-deal-analyzer.onrender.com")).toBe(
      "https://metusa-deal-analyzer.onrender.com/v1/ltd-co/compare",
    )
  })

  test("maps Flask Path A/B compare payload into dual lenses", async () => {
    const be = {
      paths: {
        A: {
          years: [
            { year: 0, cashToIndividual: -50000 },
            {
              year: 1,
              rent: 14400,
              operatingExpenses: 2400,
              financeCosts: 8438,
              tax: 3112,
              cashToIndividual: 450,
            },
          ],
        },
        B: {
          years: [
            { year: 0, cashToIndividual: -50165 },
            {
              year: 1,
              rent: 14400,
              operatingExpenses: 2400,
              financeCosts: 10312,
              tax: 400,
              cashToIndividual: 200,
              corporationTax: 190,
              complianceCost: 1500,
              dividendTax: 210,
              companyCashBeforeExtract: 410,
              retainedInCompany: 410,
            },
          ],
        },
      },
      npv: { pathA: -74025, pathB: -76492 },
      breakEven: { year: null },
      metadata: {
        lean: "path_a_personal",
        leanStrength: "soft",
        notAdvice: true,
        rationale:
          "Path A (personal) NPV is higher on these inputs. Soft numerical lean only — not a recommendation.",
        disclaimers: ["Illustrative calculation. Not tax advice."],
      },
    }
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => be,
    })
    const r = await fetchLtdCoCompare(DEFAULT_LTD_CO_INPUT, { fetchImpl })
    expect(r.source).toBe("backend")
    expect(r.ltdCoCompare.personal.year1AfterTax).toBe(450)
    expect(r.ltdCoCompare.extracted.year1AfterTax).toBe(200)
    expect(r.ltdCoCompare.retained.year1AfterTax).toBe(410)
    expect(r.ltdCoCompare.extracted.lean).toBe("personal")
    expect(r.ltdCoCompare.extracted.copy.toLowerCase()).not.toContain("incorporate now")
    expect(r.ltdCoCompare.flags.educationalOnly).toBe(true)
    const sent = JSON.parse(String(fetchImpl.mock.calls[0][1].body))
    expect(sent.property.purchasePrice).toBe(DEFAULT_LTD_CO_INPUT.deal.purchasePrice)
    expect(sent.property.annualRent).toBe(DEFAULT_LTD_CO_INPUT.deal.annualGrossRent)
    expect(sent.horizonYears).toBe(10)
  })
})

describe("toBackendComparePayload / mapBackendCompareToUi", () => {
  test("converts growth percents to decimal rates", () => {
    const p = toBackendComparePayload(DEFAULT_LTD_CO_INPUT)
    expect(p.growth).toEqual({
      rentGrowth: 0.03,
      expenseGrowth: 0.025,
    })
    expect(p.discountRate).toBe(0.05)
  })

  test("Scotland input still maps as E&NI with a flag", () => {
    const mapped = mapBackendCompareToUi(
      {
        paths: {
          A: { years: [{ year: 1, cashToIndividual: 1000, tax: 100 }] },
          B: {
            years: [
              {
                year: 1,
                cashToIndividual: 800,
                companyCashBeforeExtract: 1200,
                corporationTax: 50,
              },
            ],
          },
        },
        npv: { pathA: 900, pathB: 700 },
        metadata: { lean: "neutral", rationale: "No lean.", notAdvice: true },
      },
      {
        ...DEFAULT_LTD_CO_INPUT,
        personal: { otherTaxableIncome: 40_000, region: "scotland" },
      },
    )
    expect(mapped.flags.devolvedNation).toBe(true)
    expect(mapped.flags.devolvedNationNote).toMatch(/Scotland/)
    expect(mapped.extracted.lean).toBe("close")
  })
})

describe("disclaimer wall copy", () => {
  test("never tells the user to incorporate", () => {
    const blob = LTD_CO_DISCLAIMER_WALL.join(" ").toLowerCase()
    for (const phrase of BANNED_LEAN_PHRASES) {
      expect(blob).not.toContain(phrase)
    }
    expect(leanContainsBannedPhrase(blob)).toBe(false)
    expect(blob).toContain("not tax advice")
    expect(blob).toContain("england & northern ireland")
  })
})
