/**
 * Compliance Cockpit — catalogue + traffic-light + stub client.
 *
 * Pins the England MVP codes, default applicability, status derivation,
 * and local stub CRUD so the UI cannot silently drift from /v1/compliance/*.
 */
import { describe, expect, test } from "vitest"
import {
  COMPLIANCE_CATALOGUE_LIST,
  OBLIGATION_CODES,
  OUT_OF_SCOPE_MODULES,
  defaultApplicability,
} from "@/lib/compliance/catalogue"
import {
  calendarEventsForFile,
  deriveObligationStatus,
  daysUntil,
  hydrateObligation,
  overallStatus,
  rollupStatus,
  toIsoDate,
  addMonths,
  tryParseIsoDate,
  warnWindowDays,
} from "@/lib/compliance/status"
import { createStubClient, memoryStorage } from "@/lib/compliance/stub"
import type { PropertyRef } from "@/lib/compliance/types"

const btl: PropertyRef = {
  propertyId: "prop-1",
  address: "14 Acacia Avenue",
  nickname: "Manchester BTL",
  postcode: "M14 5AA",
  strategy: "BTL",
  bedrooms: 3,
}

const hmo: PropertyRef = {
  ...btl,
  propertyId: "prop-hmo",
  strategy: "HMO",
  bedrooms: 6,
}

function at(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

describe("catalogue MVP", () => {
  test("exposes exactly the seven England codes", () => {
    expect([...OBLIGATION_CODES]).toEqual([
      "GAS",
      "EICR",
      "EPC",
      "DEP",
      "HTR",
      "LIC_HMO",
      "LIC_SEL",
    ])
    expect(COMPLIANCE_CATALOGUE_LIST.map((c) => c.code)).toEqual([...OBLIGATION_CODES])
    for (const item of COMPLIANCE_CATALOGUE_LIST) {
      expect(item.englandOnly).toBe(true)
    }
  })

  test("documents out-of-scope modules without implementing them", () => {
    expect(OUT_OF_SCOPE_MODULES.map((m) => m.id)).toEqual([
      "MTD",
      "SCREENER",
      "LTD_CO",
      "LICENSING_FULL",
    ])
  })

  test("default applicability for BTL vs HMO", () => {
    expect(defaultApplicability("GAS", btl)).toBe("required")
    expect(defaultApplicability("LIC_HMO", btl)).toBe("not_applicable")
    expect(defaultApplicability("LIC_HMO", hmo)).toBe("required")
    expect(defaultApplicability("LIC_SEL", btl)).toBe("unknown")
    expect(defaultApplicability("LIC_HMO", { strategy: "BTL", bedrooms: 5 })).toBe(
      "unknown",
    )
  })
})

describe("traffic lights", () => {
  const now = at("2026-09-14")

  test("not applicable → na", () => {
    expect(
      deriveObligationStatus(
        { applicability: "not_applicable", evidence: [] },
        { now },
      ).status,
    ).toBe("na")
  })

  test("unknown applicability → amber (check required)", () => {
    expect(
      deriveObligationStatus({ applicability: "unknown", evidence: [] }, { now })
        .status,
    ).toBe("amber")
  })

  test("required + missing evidence → red", () => {
    expect(
      deriveObligationStatus({ applicability: "required", evidence: [] }, { now })
        .status,
    ).toBe("red")
  })

  test("expired certificate → red", () => {
    const derived = deriveObligationStatus(
      {
        applicability: "required",
        evidence: [
          {
            id: "e1",
            obligationCode: "GAS",
            filename: "cp12.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12,
            issuedOn: "2025-08-01",
            expiresOn: "2026-08-01",
            notes: null,
            schemeRef: null,
            uploadedAt: "2025-08-01T00:00:00.000Z",
          },
        ],
      },
      { now, warnDays: 60 },
    )
    expect(derived.status).toBe("red")
    expect(derived.daysUntilExpiry).toBe(daysUntil("2026-08-01", now))
    expect(derived.daysUntilExpiry).toBeLessThan(0)
  })

  test("expires inside warn window → amber", () => {
    const derived = deriveObligationStatus(
      {
        applicability: "required",
        evidence: [
          {
            id: "e1",
            obligationCode: "EICR",
            filename: "eicr.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1,
            issuedOn: "2021-10-01",
            expiresOn: "2026-10-01",
            notes: null,
            schemeRef: null,
            uploadedAt: "2021-10-01T00:00:00.000Z",
          },
        ],
      },
      { now, warnDays: 60 },
    )
    expect(derived.daysUntilExpiry).toBe(17)
    expect(derived.status).toBe("amber")
  })

  test("in date beyond warn window → green", () => {
    const derived = deriveObligationStatus(
      {
        applicability: "required",
        evidence: [
          {
            id: "e1",
            obligationCode: "EPC",
            filename: "epc.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1,
            issuedOn: "2024-01-01",
            expiresOn: "2034-01-01",
            notes: null,
            schemeRef: null,
            uploadedAt: "2024-01-01T00:00:00.000Z",
          },
        ],
      },
      { now, warnDays: 90 },
    )
    expect(derived.status).toBe("green")
  })

  test("How to Rent with evidence and no expiry → green", () => {
    expect(
      deriveObligationStatus(
        {
          applicability: "required",
          evidence: [
            {
              id: "e1",
              obligationCode: "HTR",
              filename: "how-to-rent.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1,
              issuedOn: "2026-01-01",
              expiresOn: null,
              notes: null,
              schemeRef: null,
              uploadedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        { now },
      ).status,
    ).toBe("green")
  })

  test("property rollup ignores na and takes the worst applicable light", () => {
    expect(rollupStatus(["na", "green", "amber"])).toBe("amber")
    expect(rollupStatus(["na", "green", "red"])).toBe("red")
    expect(rollupStatus(["na", "na"])).toBe("na")
    expect(warnWindowDays({ reminderDays: [7, 30, 90] })).toBe(90)
  })
})

describe("stub client", () => {
  test("links a portfolio propertyId and logs GAS evidence", async () => {
    const now = at("2026-09-14")
    const api = createStubClient({
      storage: memoryStorage(),
      now: () => now,
    })

    const dash = await api.getDashboard([btl])
    expect(dash.jurisdiction).toBe("england")
    expect(dash.source).toBe("stub")
    expect(dash.properties).toHaveLength(1)
    expect(dash.properties[0].property.propertyId).toBe("prop-1")
    expect(dash.properties[0].lights.LIC_HMO).toBe("na")
    expect(dash.properties[0].lights.LIC_SEL).toBe("amber")
    expect(dash.properties[0].lights.GAS).toBe("red")

    const after = await api.uploadEvidence("prop-1", "GAS", {
      issuedOn: "2026-09-01",
      expiresOn: "2027-09-01",
      notes: "British Gas",
    })
    const gas = after.obligations.find((o) => o.code === "GAS")
    expect(gas?.status).toBe("green")
    expect(gas?.latestExpiry).toBe("2027-09-01")
    expect(after.property.propertyId).toBe("prop-1")

    const settings = await api.putSettings({ reminderDays: [60, 30], emailEnabled: false })
    expect(settings.jurisdiction).toBe("england")
    expect(settings.reminderDays).toEqual([60, 30])
    expect(settings.emailEnabled).toBe(false)

    const events = await api.getCalendar([btl], "2027-07-01", "2027-09-30")
    expect(events.some((e) => e.kind === "expiry" && e.obligationCode === "GAS")).toBe(
      true,
    )
    expect(events.some((e) => e.kind === "reminder" && e.label.includes("60 days"))).toBe(
      true,
    )
  })

  test("calendarEventsForFile emits reminder offsets", () => {
    const file = {
      property: btl,
      overallStatus: "green" as const,
      updatedAt: "2026-09-14T00:00:00.000Z",
      obligations: [
        hydrateObligation(
          {
          code: "GAS" as const,
          applicability: "required" as const,
          notes: null,
          evidence: [
            {
              id: "e1",
              obligationCode: "GAS" as const,
              filename: "cp12.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1,
              issuedOn: "2026-01-01",
              expiresOn: "2026-12-01",
              notes: null,
              schemeRef: null,
              uploadedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          },
          { now: at("2026-09-14"), warnDays: 60 },
        ),
      ],
    }
    const events = calendarEventsForFile(file, { reminderDays: [30] }, {
      from: "2026-10-01",
      to: "2026-12-31",
    })
    expect(events.map((e) => e.kind).sort()).toEqual(["expiry", "reminder"])
    expect(events.find((e) => e.kind === "reminder")?.date).toBe("2026-11-01")
    expect(toIsoDate(at("2026-09-14"))).toBe("2026-09-14")
    expect(overallStatus(file)).toBe("green")
    expect(toIsoDate(tryParseIsoDate("2026-09-01")!)).toBe("2026-09-01")
    expect(tryParseIsoDate("09/01/2026")).toBeNull()
    expect(toIsoDate(addMonths(at("2026-09-01"), 12))).toBe("2027-09-01")
  })
})
