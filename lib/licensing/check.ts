import { parsePostcode } from "@/lib/article4-service"
import type { Article4CheckResult } from "@/lib/article4-service"
import type {
  LicensingBanner,
  LicensingCheckInput,
  LicensingCheckResult,
  LicensingConfidence,
  LicensingFlag,
  LicensingFreshness,
  LicensingGeo,
  LicensingIntendedUse,
  LicensingNation,
  TrafficLight,
} from "./types"
import {
  ENGLAND_FIRST_BANNER,
  LEGAL_CLEARANCE_DISCLAIMER,
  NOT_LEGAL_CLEARANCE_BANNER,
  PLANNING_DATA_A4_BANNER,
} from "./types"
import { matchCouncilRecord, SCHEME_SOURCES } from "./schemes"

export interface CheckLicensingDeps {
  geocode: (postcode: string) => Promise<LicensingGeo | null>
  checkArticle4: (postcode: string) => Promise<Article4CheckResult>
  now?: Date
}

const MANDATORY_SINCE = "2018-10-01"

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function freshness(asOf: string, sourceUpdatedAt: string | null, label: string): LicensingFreshness {
  return { asOf, sourceUpdatedAt, label }
}

function toNation(raw: string | null | undefined): LicensingNation {
  const s = (raw ?? "").trim()
  if (s === "England" || s === "Scotland" || s === "Wales" || s === "Northern Ireland") {
    return s
  }
  return "unknown"
}

function formatPostcode(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "")
  if (cleaned.length < 5) return cleaned
  return `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`
}

function parseOptionalCount(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

function overallTrafficLight(flags: LicensingFlag[]): TrafficLight {
  if (flags.some((f) => f.trafficLight === "red")) return "red"
  if (flags.some((f) => f.trafficLight === "amber")) return "amber"
  if (flags.every((f) => f.trafficLight === "grey")) return "grey"
  return "green"
}

function overallLabel(light: TrafficLight): string {
  switch (light) {
    case "red":
      return "Licence or planning restriction indicated — verify before proceeding"
    case "amber":
      return "Verify licensing and Article 4 with the council before proceeding"
    case "green":
      return "No restriction indicated on current data — not a determination"
    case "grey":
      return "Insufficient data to screen this postcode"
  }
}

function greyFlag(
  id: LicensingFlag["id"],
  label: string,
  status: LicensingFlag["status"],
  summary: string,
  asOf: string,
  sources: LicensingFlag["sources"],
  confidence: LicensingConfidence = "none",
): LicensingFlag {
  return {
    id,
    label,
    trafficLight: "grey",
    severity: "info",
    confidence,
    status,
    summary,
    freshness: freshness(asOf, null, "No live confirmation for this flag"),
    sources,
  }
}

function mandatoryFlag(
  input: LicensingCheckInput,
  asOf: string,
): LicensingFlag {
  const occupants = parseOptionalCount(input.occupants)
  const rooms = parseOptionalCount(input.rooms)
  const use: LicensingIntendedUse = input.intendedUse ?? "other"
  const likelyLargeHmo =
    (occupants != null && occupants >= 5) ||
    (use === "hmo" && rooms != null && rooms >= 5)

  const sources = [SCHEME_SOURCES.housingAct, SCHEME_SOURCES.govHmo]
  const base = {
    id: "mandatory_hmo" as const,
    label: "Mandatory HMO licensing",
    sources,
    freshness: freshness(
      asOf,
      MANDATORY_SINCE,
      "National rule in force since 1 Oct 2018",
    ),
  }

  if (likelyLargeHmo) {
    return {
      ...base,
      trafficLight: "red",
      severity: "high",
      confidence: "high",
      status: "in_force",
      summary:
        "England’s mandatory HMO licence applies to properties occupied by five or more people forming two or more households. The occupancy / room figures supplied indicate this threshold. Confirm the current licence, exemptions and conditions with the local housing authority — this is not a determination.",
    }
  }

  if (occupants != null && occupants < 5) {
    return {
      ...base,
      trafficLight: "green",
      severity: "info",
      confidence: "high",
      status: "not_triggered",
      summary:
        "Mandatory HMO licensing in England is not triggered below five occupants (two or more households). Additional or selective licensing may still apply. Confirm with the council; this is not a determination.",
    }
  }

  return {
    ...base,
    trafficLight: "amber",
    severity: "medium",
    confidence: "high",
    status: "may_apply",
    summary:
      "Mandatory HMO licensing applies across England to HMOs with five or more occupants in two or more households (the three-storey test was removed on 1 Oct 2018). Occupancy is not confirmed here, so treat this as a live check if the property is or will be an HMO. Confirm with the local housing authority.",
  }
}

function schemeFlags(
  council: string | null,
  asOf: string,
): { additional: LicensingFlag; selective: LicensingFlag } {
  const record = matchCouncilRecord(council)
  const additionalSources = [SCHEME_SOURCES.govHmo, SCHEME_SOURCES.govSelective]
  const selectiveSources = [SCHEME_SOURCES.govSelective]

  const unknownAdditional = greyFlag(
    "additional_hmo",
    "Additional HMO licensing",
    "unknown",
    council
      ? `No additional HMO scheme is in the current England snapshot for ${council}. Absence from this list is not evidence that no scheme exists — designations change and some are street-level. Confirm with the local housing authority.`
      : "Additional HMO licensing could not be screened — council was not resolved for this postcode. Confirm with the local housing authority.",
    asOf,
    additionalSources,
    council ? "low" : "none",
  )

  const unknownSelective = greyFlag(
    "selective",
    "Selective licensing",
    "unknown",
    council
      ? `No selective licensing scheme is in the current England snapshot for ${council}. Absence from this list is not evidence that no designation exists. Confirm with the local housing authority.`
      : "Selective licensing could not be screened — council was not resolved for this postcode. Confirm with the local housing authority.",
    asOf,
    selectiveSources,
    council ? "low" : "none",
  )

  if (!record) {
    return { additional: unknownAdditional, selective: unknownSelective }
  }

  const fromScheme = (
    kind: "additional_hmo" | "selective",
  ): LicensingFlag | null => {
    const signal = record.schemes.find((s) => s.kind === kind)
    if (!signal) return null
    const isAdditional = kind === "additional_hmo"
    const label = isAdditional ? "Additional HMO licensing" : "Selective licensing"
    const sources = isAdditional ? additionalSources : selectiveSources
    if (signal.status === "proposed") {
      return {
        id: kind,
        label,
        trafficLight: "amber",
        severity: "medium",
        confidence: "medium",
        status: "proposed",
        summary: `${record.name} has a proposed ${isAdditional ? "additional HMO" : "selective"} licensing designation in the current snapshot. Proposed schemes can be confirmed or dropped — check the council’s latest consultation and designation notices.`,
        freshness: freshness(asOf, record.lastVerifiedAt, `Snapshot ${record.lastVerifiedAt}`),
        sources: [...sources, { name: `${record.name} licensing`, url: record.sourceUrl }],
      }
    }
    if (signal.coverage === "partial") {
      return {
        id: kind,
        label,
        trafficLight: "amber",
        severity: "high",
        confidence: "medium",
        status: "may_apply",
        summary: `${record.name} operates ${isAdditional ? "additional HMO" : "selective"} licensing in part of the district. This postcode may sit inside or outside the designated streets / wards. Confirm the current boundary, fees and exemptions with the council before exchanging.`,
        freshness: freshness(asOf, record.lastVerifiedAt, `Snapshot ${record.lastVerifiedAt}`),
        sources: [...sources, { name: `${record.name} licensing`, url: record.sourceUrl }],
      }
    }
    return {
      id: kind,
      label,
      trafficLight: "red",
      severity: "high",
      confidence: "medium",
      status: "in_force",
      summary: `${record.name} is indicated as operating authority-wide ${isAdditional ? "additional HMO" : "selective"} licensing in the current snapshot. Confirm the designation is still in force, plus any exemptions, with the council. This is not a licence determination.`,
      freshness: freshness(asOf, record.lastVerifiedAt, `Snapshot ${record.lastVerifiedAt}`),
      sources: [...sources, { name: `${record.name} licensing`, url: record.sourceUrl }],
    }
  }

  return {
    additional: fromScheme("additional_hmo") ?? unknownAdditional,
    selective: fromScheme("selective") ?? unknownSelective,
  }
}

function article4Flag(a4: Article4CheckResult, asOf: string): LicensingFlag {
  const sources = [SCHEME_SOURCES.planningData]
  const lastVerified =
    a4.areas.map((a) => a.lastVerifiedAt).find((d) => !!d) ?? null
  const council =
    a4.areas.find((a) => a.councilName)?.councilName ?? null

  if (a4.status === "active") {
    return {
      id: "article4_c3_c4",
      label: "Article 4 (C3→C4)",
      trafficLight: "red",
      severity: "high",
      confidence: "high",
      status: "in_force",
      summary:
        a4.summary ||
        `An HMO Article 4 direction (C3→C4) is indicated${council ? ` in ${council}` : ""}. Conversion typically needs full planning permission, not permitted development. Confirm the exact boundary with the local planning authority.`,
      freshness: freshness(
        asOf,
        lastVerified,
        lastVerified ? `Last verified ${lastVerified}` : "Live Planning Data + curated table",
      ),
      sources,
    }
  }

  if (a4.status === "proposed") {
    return {
      id: "article4_c3_c4",
      label: "Article 4 (C3→C4)",
      trafficLight: "amber",
      severity: "medium",
      confidence: "medium",
      status: "proposed",
      summary:
        a4.summary ||
        "An Article 4 direction affecting C3→C4 is proposed or in consultation. If confirmed, HMO conversion will need planning permission. Monitor the LPA.",
      freshness: freshness(asOf, lastVerified, "Proposed / consultation"),
      sources,
    }
  }

  if (a4.status === "none") {
    return {
      id: "article4_c3_c4",
      label: "Article 4 (C3→C4)",
      trafficLight: "green",
      severity: "info",
      confidence: "medium",
      status: "not_indicated",
      summary:
        "No HMO Article 4 (C3→C4) direction was found for this point in Planning Data merged with the curated table. Coverage is incomplete, so permitted development is not confirmed. Check the local planning authority before relying on a C3→C4 conversion.",
      freshness: freshness(asOf, lastVerified, "Live Planning Data + curated table"),
      sources,
    }
  }

  return {
    id: "article4_c3_c4",
    label: "Article 4 (C3→C4)",
    trafficLight: a4.warningLevel === "amber" ? "amber" : "grey",
    severity: "medium",
    confidence: "low",
    status: "unknown",
    summary:
      a4.summary ||
      "Article 4 C3→C4 status could not be confirmed. Verify permitted-development rights with the local planning authority.",
    freshness: freshness(asOf, lastVerified, "Unconfirmed"),
    sources,
  }
}

function outOfCoverageFlags(asOf: string, nation: LicensingNation): LicensingFlag[] {
  const where = nation === "unknown" ? "this location" : nation
  const summary = `Licensing screening for ${where} is not in this England-first release. Local HMO and landlord licensing rules differ. Check the relevant local authority. This is not a determination.`
  const a4 = greyFlag(
    "article4_c3_c4",
    "Article 4 (C3→C4)",
    "out_of_coverage",
    `Article 4 C3→C4 screening is England-first in this release. Confirm permitted-development rights with the local planning authority in ${where}.`,
    asOf,
    [SCHEME_SOURCES.planningData],
  )
  return [
    greyFlag(
      "mandatory_hmo",
      "Mandatory HMO licensing",
      "out_of_coverage",
      summary,
      asOf,
      [SCHEME_SOURCES.govHmo],
    ),
    greyFlag(
      "additional_hmo",
      "Additional HMO licensing",
      "out_of_coverage",
      summary,
      asOf,
      [SCHEME_SOURCES.govHmo],
    ),
    greyFlag(
      "selective",
      "Selective licensing",
      "out_of_coverage",
      summary,
      asOf,
      [SCHEME_SOURCES.govSelective],
    ),
    a4,
  ]
}

/**
 * Assemble a licensing check. Always sets legalClearance: false.
 * Does not throw on upstream failure — flags degrade to grey.
 */
export async function checkLicensing(
  input: LicensingCheckInput,
  deps: CheckLicensingDeps,
): Promise<LicensingCheckResult> {
  const now = deps.now ?? new Date()
  const asOf = isoDay(now)
  const checkedAt = now.toISOString()
  const parsed = parsePostcode(input.postcode)
  const displayPc = formatPostcode(input.postcode)

  const emptyLocation = {
    postcode: displayPc,
    district: parsed?.district ?? null,
    sector: parsed?.sector ?? null,
    council: null as string | null,
    country: "unknown" as LicensingNation,
  }

  if (!parsed) {
    const flags = outOfCoverageFlags(asOf, "unknown")
    const light = overallTrafficLight(flags)
    return {
      ok: true,
      legalClearance: false,
      disclaimer: LEGAL_CLEARANCE_DISCLAIMER,
      coverage: { nation: "unknown", supported: false, englandFirst: true },
      location: emptyLocation,
      banners: [NOT_LEGAL_CLEARANCE_BANNER, ENGLAND_FIRST_BANNER, PLANNING_DATA_A4_BANNER],
      flags,
      overallTrafficLight: light,
      overallLabel: "Postcode could not be parsed — cannot screen",
      checkedAt,
      flag: "licensing_checker_v1",
    }
  }

  let geo: LicensingGeo | null = null
  try {
    geo = await deps.geocode(input.postcode)
  } catch {
    geo = null
  }

  const country: LicensingNation = geo?.country ?? toNation(null)
  const council = geo?.council ?? null
  const location = {
    postcode: geo?.postcode || displayPc,
    district: geo?.district ?? parsed.district,
    sector: geo?.sector ?? parsed.sector,
    council,
    country,
  }

  const banners: LicensingBanner[] = [NOT_LEGAL_CLEARANCE_BANNER, PLANNING_DATA_A4_BANNER]
  const england = country === "England"

  if (!england) {
    banners.splice(1, 0, ENGLAND_FIRST_BANNER)
    const flags = outOfCoverageFlags(asOf, country)
    const light = overallTrafficLight(flags)
    return {
      ok: true,
      legalClearance: false,
      disclaimer: LEGAL_CLEARANCE_DISCLAIMER,
      coverage: { nation: country, supported: false, englandFirst: true },
      location,
      banners,
      flags,
      overallTrafficLight: light,
      overallLabel: overallLabel(light),
      checkedAt,
      flag: "licensing_checker_v1",
    }
  }

  let a4: Article4CheckResult
  try {
    a4 = await deps.checkArticle4(input.postcode)
  } catch {
    a4 = {
      isArticle4: false,
      status: "unknown",
      areas: [],
      warningLevel: "none",
      summary: "Article 4 status could not be confirmed for this postcode.",
      district: location.district,
      sector: location.sector,
    }
  }

  const schemes = schemeFlags(council, asOf)
  const flags: LicensingFlag[] = [
    mandatoryFlag(input, asOf),
    schemes.additional,
    schemes.selective,
    article4Flag(a4, asOf),
  ]

  const light = overallTrafficLight(flags)
  return {
    ok: true,
    legalClearance: false,
    disclaimer: LEGAL_CLEARANCE_DISCLAIMER,
    coverage: { nation: "England", supported: true, englandFirst: true },
    location,
    banners,
    flags,
    overallTrafficLight: light,
    overallLabel: overallLabel(light),
    checkedAt,
    flag: "licensing_checker_v1",
  }
}

export function licensingBadgeFromCheck(result: LicensingCheckResult) {
  const hottest = result.flags.find((f) => f.trafficLight === result.overallTrafficLight)
  return {
    trafficLight: result.overallTrafficLight,
    label:
      result.overallTrafficLight === "grey"
        ? "Licensing unconfirmed"
        : hottest
          ? `Licensing: ${hottest.label}`
          : "Licensing",
  }
}
