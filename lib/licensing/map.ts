/**
 * Map Flask `/v1/licensing/check` JSON onto the Analyse / tools display model.
 *
 * Display traffic lights only. Never invent a second licensing engine.
 * Absence / carve-out / miss → grey or amber — never a false green.
 */

import { FlaskLicensingError } from "./flask"
import type {
  LicensingApplies,
  LicensingBanner,
  LicensingCheckResult,
  LicensingConfidence,
  LicensingDealImpact,
  LicensingFeeItem,
  LicensingFlag,
  LicensingFlagStatus,
  LicensingKiller,
  LicensingLocation,
  LicensingNation,
  LicensingRiskNote,
  LicensingSeverity,
  SeverityClass,
  TrafficLight,
} from "./types"
import {
  ENGLAND_FIRST_BANNER,
  LEGAL_CLEARANCE_DISCLAIMER,
  NOT_LEGAL_CLEARANCE_BANNER,
  PLANNING_DATA_A4_BANNER,
  STALE_DATA_BANNER,
} from "./types"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  return null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value
  return null
}

function disclaimerText(raw: unknown): string {
  if (isRecord(raw) && typeof raw.text === "string" && raw.text.trim()) {
    return raw.text.trim()
  }
  if (typeof raw === "string" && raw.trim()) return raw.trim()
  return LEGAL_CLEARANCE_DISCLAIMER
}

function toNation(raw: unknown): LicensingNation {
  const s = (asString(raw) ?? "").replace(/_/g, " ")
  const lower = s.toLowerCase()
  if (lower === "england") return "England"
  if (lower === "scotland") return "Scotland"
  if (lower === "wales") return "Wales"
  if (lower === "northern ireland") return "Northern Ireland"
  return "unknown"
}

function toSeverityClass(raw: unknown): SeverityClass {
  const s = (asString(raw) ?? "").toLowerCase()
  if (s === "deal_killer" || s === "compliance_cost" || s === "soft_warning" || s === "info") {
    return s
  }
  if (s === "high") return "deal_killer"
  if (s === "medium") return "compliance_cost"
  if (s === "low") return "info"
  return "info"
}

function severityForDisplay(cls: SeverityClass): LicensingSeverity {
  switch (cls) {
    case "deal_killer":
      return "high"
    case "compliance_cost":
      return "medium"
    case "soft_warning":
      return "low"
    case "info":
      return "info"
  }
}

function toApplies(raw: unknown): LicensingApplies {
  const s = (asString(raw) ?? "").toLowerCase()
  if (s === "yes" || s === "no" || s === "possible" || s === "conditional") return s
  return "possible"
}

function toConfidence(rawBand: unknown, rawScore: unknown): LicensingConfidence {
  const band = (asString(rawBand) ?? "").toLowerCase()
  if (band === "high") return "high"
  if (band === "medium") return "medium"
  if (band === "low") return "low"
  if (band === "unknown" || band === "none") return "none"
  const n = asNumber(rawScore)
  if (n == null) return "none"
  if (n >= 0.85) return "high"
  if (n >= 0.55) return "medium"
  if (n >= 0.3) return "low"
  return "none"
}

function statusFromApplies(applies: LicensingApplies, nation: LicensingNation): LicensingFlagStatus {
  if (nation !== "England") return "out_of_coverage"
  if (applies === "yes") return "in_force"
  if (applies === "possible" || applies === "conditional") return "may_apply"
  return "not_indicated"
}

/**
 * Display lights from BE severity_class + applies.
 * Deal killers that apply or may apply stay red. Misses and carve-outs
 * stay grey. Partial coverage stays amber. Never green from absence.
 */
export function displayTrafficLight(flag: {
  applies?: unknown
  severity_class?: unknown
  severity?: unknown
}): TrafficLight {
  const applies = toApplies(flag.applies)
  const cls = toSeverityClass(flag.severity_class ?? flag.severity)
  if (applies === "no") return "grey"
  if (cls === "deal_killer") return "red"
  if (applies === "possible" || applies === "conditional") return "amber"
  if (cls === "compliance_cost" || cls === "soft_warning") return "amber"
  return "grey"
}

export function overallTrafficLight(
  flags: Pick<LicensingFlag, "trafficLight">[],
  dealImpact?: LicensingDealImpact | null,
): TrafficLight {
  const level = (dealImpact?.level || "").toLowerCase()
  if (level === "deal_killer" || (dealImpact?.killers?.length ?? 0) > 0) {
    if (flags.some((f) => f.trafficLight === "red") || level === "deal_killer") return "red"
  }
  if (flags.some((f) => f.trafficLight === "red")) return "red"
  if (flags.some((f) => f.trafficLight === "amber")) return "amber"
  return "grey"
}

function overallLabel(light: TrafficLight, nation: LicensingNation): string {
  if (nation !== "England") {
    return "England first — this nation is out of coverage"
  }
  switch (light) {
    case "red":
      return "Licence or planning restriction indicated — verify before proceeding"
    case "amber":
      return "Verify licensing and Article 4 with the council before proceeding"
    default:
      return "Insufficient data to treat this as a restriction or an all-clear"
  }
}

function mapSources(raw: unknown): LicensingFlag["sources"] {
  if (!Array.isArray(raw)) return []
  const out: LicensingFlag["sources"] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const name = asString(item.name)
    if (!name) continue
    out.push({ name, url: asString(item.url) })
  }
  return out
}

function mapFreshness(flag: Record<string, unknown>, checkedAt: string): LicensingFlag["freshness"] {
  const fresh = isRecord(flag.freshness) ? flag.freshness : {}
  const sourceUpdatedAt =
    asString(fresh.last_verified_at) ?? asString(flag.last_verified_at)
  const stale = asBool(fresh.stale) === true
  const asOf = asString(fresh.last_verified_at) ?? checkedAt
  let label = "Check-time snapshot"
  if (sourceUpdatedAt) {
    label = stale ? `Verified ${sourceUpdatedAt.slice(0, 10)} (stale)` : `Verified ${sourceUpdatedAt.slice(0, 10)}`
  }
  return { asOf, sourceUpdatedAt, label, stale }
}

function mapFlag(raw: unknown, checkedAt: string, nation: LicensingNation): LicensingFlag | null {
  if (!isRecord(raw)) return null
  const id = asString(raw.id)
  const title = asString(raw.title) ?? asString(raw.label)
  const summary = asString(raw.summary)
  if (!id || !title || !summary) return null
  const applies = toApplies(raw.applies)
  const severityClass = toSeverityClass(raw.severity_class ?? raw.severity)
  return {
    id,
    label: title,
    trafficLight: displayTrafficLight(raw),
    severityClass,
    severity: severityForDisplay(severityClass),
    applies,
    confidence: toConfidence(raw.confidence_band, raw.confidence),
    status: statusFromApplies(applies, nation),
    summary,
    freshness: mapFreshness(raw, checkedAt),
    sources: mapSources(raw.sources),
  }
}

function mapKillers(raw: unknown): LicensingKiller[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    if (typeof item === "string") return { title: item, summary: item }
    if (!isRecord(item)) return {}
    return {
      flag_id: asString(item.flag_id) ?? undefined,
      title: asString(item.title) ?? undefined,
      summary: asString(item.summary) ?? undefined,
      applies: asString(item.applies) ?? undefined,
    }
  })
}

function mapFeeItems(raw: unknown): LicensingFeeItem[] {
  if (!Array.isArray(raw)) return []
  const out: LicensingFeeItem[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    out.push({
      id: asString(item.id) ?? undefined,
      flag_id: asString(item.flag_id) ?? undefined,
      kind: asString(item.kind) ?? undefined,
      label: asString(item.label) ?? asString(item.summary) ?? undefined,
      min_gbp: asNumber(item.min_gbp),
      max_gbp: asNumber(item.max_gbp),
      range_text: asString(item.range_text),
      term_years: asNumber(item.term_years),
      known: asBool(item.known) ?? undefined,
      currency: asString(item.currency) ?? "GBP",
    })
  }
  return out
}

function mapRiskNotes(raw: unknown): LicensingRiskNote[] {
  if (!Array.isArray(raw)) return []
  const out: LicensingRiskNote[] = []
  for (const item of raw) {
    if (typeof item === "string") {
      out.push({ summary: item })
      continue
    }
    if (!isRecord(item)) continue
    out.push({
      id: asString(item.id) ?? undefined,
      flag_id: asString(item.flag_id) ?? undefined,
      kind: asString(item.kind) ?? undefined,
      deal_impact: asString(item.deal_impact) ?? undefined,
      summary: asString(item.summary) ?? undefined,
    })
  }
  return out
}

function mapDealImpact(raw: unknown): LicensingDealImpact | null {
  if (!isRecord(raw)) return null
  const fees = isRecord(raw.estimated_licence_fees_gbp) ? raw.estimated_licence_fees_gbp : {}
  const hooks = isRecord(raw.analyse_hooks) ? raw.analyse_hooks : {}
  const capex = mapFeeItems(hooks.add_capex_lines ?? fees.items)
  return {
    level: toSeverityClass(raw.level ?? raw.verdict),
    verdict: asString(raw.verdict) ?? asString(raw.level) ?? "info",
    killers: mapKillers(raw.killers),
    drivers: Array.isArray(raw.drivers) ? raw.drivers : [],
    fee_hooks: Array.isArray(raw.fee_hooks) ? raw.fee_hooks : [],
    estimated_licence_fees_gbp: {
      currency: asString(fees.currency) ?? "GBP",
      min: asNumber(fees.min),
      max: asNumber(fees.max),
      known: asBool(fees.known) === true,
      items: mapFeeItems(fees.items),
    },
    analyse_hooks: {
      add_capex_lines: capex,
      add_risk_notes: mapRiskNotes(hooks.add_risk_notes),
    },
  }
}

function mapLocation(raw: unknown, fallbackPostcode: string): LicensingLocation {
  const loc = isRecord(raw) ? raw : {}
  const outward = asString(loc.postcode_outward)
  const inward = asString(loc.postcode_inward)
  const sector =
    outward && inward ? `${outward} ${inward.slice(0, 1)}` : outward
  return {
    postcode: asString(loc.postcode) ?? fallbackPostcode,
    district: outward,
    sector,
    council: asString(loc.la_name) ?? asString(loc.council),
    country: toNation(loc.country),
  }
}

function errorCode(json: unknown): string | null {
  if (!isRecord(json)) return null
  if (isRecord(json.error)) return asString(json.error.code)
  return asString(json.error)
}

function errorMessage(json: unknown, status: number): string {
  if (!isRecord(json)) return `Licensing check failed (${status})`
  if (isRecord(json.error) && asString(json.error.message)) return asString(json.error.message)!
  if (typeof json.error === "string") return json.error
  return `Licensing check failed (${status})`
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

export function mapFlaskLicensingResponse(
  json: unknown,
  opts: { httpStatus?: number } = {},
): LicensingCheckResult {
  const status = opts.httpStatus ?? 200
  if (!isRecord(json)) {
    throw new FlaskLicensingError("Analyzer licensing check returned an unexpected payload", {
      status,
      code: "invalid_upstream_json",
      body: json,
    })
  }

  if (json.ok === false || (status >= 400 && json.ok !== true)) {
    throw new FlaskLicensingError(errorMessage(json, status), {
      status,
      code: errorCode(json),
      disclaimer: disclaimerText(json.disclaimer),
      body: json,
    })
  }

  const checkedAt = asString(json.checked_at) ?? new Date().toISOString()
  const location = mapLocation(json.location, asString(isRecord(json.inputs) ? json.inputs.postcode : null) ?? "")
  const nation = location.country
  const flags = (Array.isArray(json.flags) ? json.flags : [])
    .map((f) => mapFlag(f, checkedAt, nation))
    .filter((f): f is LicensingFlag => f != null)
  const dealImpact = mapDealImpact(json.deal_impact)
  const light = overallTrafficLight(flags, dealImpact)

  const banners: LicensingBanner[] = [NOT_LEGAL_CLEARANCE_BANNER, PLANNING_DATA_A4_BANNER]
  if (nation !== "England") banners.push(ENGLAND_FIRST_BANNER)
  const stale = isRecord(json.freshness) && json.freshness.stale === true
  if (stale) banners.push(STALE_DATA_BANNER)

  return {
    ok: true,
    legalClearance: false,
    disclaimer: disclaimerText(json.disclaimer),
    coverage: {
      nation,
      supported: nation === "England",
      englandFirst: true,
    },
    location,
    banners,
    flags,
    dealImpact,
    overallTrafficLight: light,
    overallLabel: overallLabel(light, nation),
    checkedAt,
    flag: "licensing_checker_v1",
  }
}
