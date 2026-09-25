/**
 * Flask PR #93 catalogue/dashboard adapters.
 *
 * `{items}` → cockpit catalogue. Status map. Property overlay without
 * requiring PUT /properties or GET /settings.
 */
import { describe, expect, test } from "vitest"
import {
  composeDashboard,
  composePropertyFile,
  mapBeStatus,
  mapCatalogueResponse,
  reminderDaysFromCatalogue,
  type BeObligation,
} from "@/lib/compliance/adapter"
import { OBLIGATION_CODES, type PropertyRef } from "@/lib/compliance/types"

const btl: PropertyRef = {
  propertyId: "11111111-1111-4111-8111-111111111111",
  address: "14 Acacia Avenue",
  nickname: "Manchester BTL",
  postcode: "M14 5AA",
  strategy: "BTL",
  bedrooms: 3,
}

const hmo: PropertyRef = {
  ...btl,
  propertyId: "22222222-2222-4222-8222-222222222222",
  nickname: "Oxford HMO",
  strategy: "HMO",
  bedrooms: 6,
}

const beItems = [
  {
    code: "GAS",
    name: "Gas Safety Certificate (CP12)",
    jurisdiction: "UK",
    defaultValidityYears: 1,
    dueSoonDays: 90,
    description: "Annual gas safety.",
    reminderOffsetsDays: [-90, -60, -30, -14, -7, 0, 1],
  },
  {
    code: "EICR",
    name: "Electrical Installation Condition Report",
    defaultValidityYears: 5,
  },
  { code: "EPC", name: "Energy Performance Certificate", defaultValidityYears: 10 },
  { code: "DEP", name: "Tenancy deposit protection", defaultValidityYears: null },
  { code: "HTR", name: "How to Rent", defaultValidityYears: null },
  { code: "LIC_HMO", name: "HMO licence", defaultValidityYears: 5 },
  { code: "LIC_SEL", name: "Selective licence", defaultValidityYears: 5 },
  { code: "MTD", name: "Making Tax Digital" },
]

describe("mapCatalogueResponse {items}", () => {
  test("maps the seven MVP codes and ignores unknown modules", () => {
    const mapped = mapCatalogueResponse({ success: true, items: beItems })
    expect(mapped.map((c) => c.code)).toEqual([...OBLIGATION_CODES])
    expect(mapped.find((c) => (c as { code: string }).code === "MTD")).toBeUndefined()
    const gas = mapped.find((c) => c.code === "GAS")
    expect(gas?.typicalValidity).toBe("12 months")
    expect(gas?.typicalValidityMonths).toBe(12)
    expect(gas?.englandOnly).toBe(true)
  })

  test("falls back to local catalogue when items are missing", () => {
    expect(mapCatalogueResponse({}).map((c) => c.code)).toEqual([...OBLIGATION_CODES])
    expect(mapCatalogueResponse({ catalogue: beItems.slice(0, 2) }).map((c) => c.code)).toEqual([
      "GAS",
      "EICR",
    ])
  })

  test("reads reminderOffsetsDays from the catalogue envelope", () => {
    expect(
      reminderDaysFromCatalogue({
        reminderOffsetsDays: [-90, -60, -30, -14, -7, 0, 1],
      }),
    ).toEqual([90, 60, 30, 14, 7])
  })
})

describe("mapBeStatus", () => {
  test("maps Flask statuses onto traffic lights", () => {
    expect(mapBeStatus("valid")).toBe("green")
    expect(mapBeStatus("due_soon")).toBe("amber")
    expect(mapBeStatus("overdue")).toBe("red")
    expect(mapBeStatus("not_applicable")).toBe("na")
    expect(mapBeStatus("unknown")).toBe("amber")
  })
})

describe("composePropertyFile / composeDashboard", () => {
  test("overlays seven catalogue rows; LIC_HMO is N/A on BTL when no instance", () => {
    const now = new Date(2026, 8, 14, 12)
    const gas: BeObligation = {
      id: "ob-gas",
      propertyId: btl.propertyId,
      code: "GAS",
      status: "valid",
      issuedOn: "2026-09-01",
      expiresOn: "2027-09-01",
      evidence: [],
    }
    const file = composePropertyFile(btl, [gas], now)
    expect(file.obligations).toHaveLength(7)
    expect(file.obligations.find((o) => o.code === "GAS")?.status).toBe("green")
    expect(file.obligations.find((o) => o.code === "GAS")?.instanceId).toBe("ob-gas")
    expect(file.obligations.find((o) => o.code === "EICR")?.status).toBe("red")
    expect(file.obligations.find((o) => o.code === "EICR")?.instanceId).toBeNull()
    expect(file.obligations.find((o) => o.code === "LIC_HMO")?.status).toBe("na")
    expect(file.obligations.find((o) => o.code === "LIC_HMO")?.applicability).toBe(
      "not_applicable",
    )
    expect(file.obligations.find((o) => o.code === "LIC_SEL")?.status).toBe("amber")
  })

  test("groups dashboard obligations by propertyId without a settings document", () => {
    const now = new Date(2026, 8, 14, 12)
    const obligations: BeObligation[] = [
      {
        id: "a",
        propertyId: btl.propertyId,
        code: "GAS",
        status: "overdue",
        issuedOn: null,
        expiresOn: "2026-01-01",
      },
      {
        id: "b",
        propertyId: hmo.propertyId,
        code: "LIC_HMO",
        status: "valid",
        issuedOn: "2024-01-01",
        expiresOn: "2029-01-01",
      },
    ]
    const dash = composeDashboard([btl, hmo], obligations, now)
    expect(dash.source).toBe("live")
    expect(dash.properties).toHaveLength(2)
    expect(dash.properties[0].lights.GAS).toBe("red")
    expect(dash.properties[0].lights.LIC_HMO).toBe("na")
    expect(dash.properties[1].lights.LIC_HMO).toBe("green")
    expect(dash.summary.properties).toBe(2)
  })

  test("QA r4: Missing is required+no record; licences unknown/N/A are excluded", () => {
    const now = new Date(2026, 8, 25, 12)
    const obligations: BeObligation[] = [
      {
        id: "gas",
        propertyId: btl.propertyId,
        code: "GAS",
        status: "valid",
        issuedOn: "2026-09-01",
        expiresOn: "2027-09-01",
        evidence: [],
      },
      {
        id: "eicr",
        propertyId: btl.propertyId,
        code: "EICR",
        status: "overdue",
        issuedOn: "2021-06-01",
        expiresOn: "2026-06-01",
        evidence: [],
      },
      {
        id: "epc",
        propertyId: btl.propertyId,
        code: "EPC",
        status: "due_soon",
        issuedOn: "2016-11-15",
        expiresOn: "2026-11-15",
        evidence: [],
      },
    ]
    const dash = composeDashboard([btl], obligations, now)
    const file = composePropertyFile(btl, obligations, now)
    const unlogged = file.obligations.filter(
      (o) => o.applicability === "required" && !o.issuedOn && o.evidence.length === 0,
    )
    expect(unlogged.map((o) => o.code)).toEqual(["DEP", "HTR"])
    expect(dash.summary.missing).toBe(2)
    expect(dash.properties[0].missingCount).toBe(2)
    expect(dash.summary.overdue).toBe(1)
    expect(dash.properties[0].overdueCount).toBe(1)
    expect(dash.summary.unknown).toBe(1)
    expect(file.obligations.find((o) => o.code === "LIC_SEL")?.applicability).toBe(
      "unknown",
    )
    expect(file.obligations.find((o) => o.code === "LIC_HMO")?.applicability).toBe(
      "not_applicable",
    )
  })

  test("persisted N/A is green/neutral and not Missing", () => {
    const now = new Date(2026, 8, 25, 12)
    const file = composePropertyFile(
      btl,
      [
        {
          id: "gas-na",
          propertyId: btl.propertyId,
          code: "GAS",
          status: "not_applicable",
          applicability: "not_applicable",
          applicabilityReason: "no gas supply",
          issuedOn: null,
          evidence: [],
        },
      ],
      now,
    )
    const gas = file.obligations.find((o) => o.code === "GAS")
    expect(gas?.status).toBe("na")
    expect(gas?.applicability).toBe("not_applicable")
    const dash = composeDashboard(
      [btl],
      [
        {
          id: "gas-na",
          propertyId: btl.propertyId,
          code: "GAS",
          status: "not_applicable",
          applicability: "not_applicable",
          applicabilityReason: "no gas supply",
        },
      ],
      now,
    )
    // GAS is N/A; remaining required-without-record: EICR, EPC, DEP, HTR
    expect(dash.summary.missing).toBe(4)
    expect(dash.properties[0].missingCount).toBe(4)
  })
})
