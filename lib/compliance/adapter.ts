/**
 * Adapter: Flask `/v1/compliance` (metusa-deal-analyzer PR #93) → cockpit UI.
 *
 * Flask is the source of truth. These mappers never persist; they only
 * reshape `{items}`, obligation instances, dashboard counts, and reminder
 * stubs into the traffic-light views the UI already renders.
 */

import {
  COMPLIANCE_CATALOGUE,
  COMPLIANCE_CATALOGUE_LIST,
  defaultApplicability,
  catalogueByCode,
} from "./catalogue"
import {
  countByLight,
  daysUntil,
  lightsMap,
  overallStatus,
} from "./status"
import {
  DEFAULT_UNIT_CAP,
  OBLIGATION_CODES,
  type CalendarEvent,
  type ComplianceDashboard,
  type EvidenceRecord,
  type ObligationCode,
  type ObligationDefinition,
  type ObligationState,
  type PropertyComplianceFile,
  type PropertyRef,
  type TrafficLight,
} from "./types"

/** Deep-link path reminder emails must use (note for BE: not `/compliance`). */
export const COMPLIANCE_COCKPIT_PATH = "/tools/compliance"

export type BeStatus = "valid" | "due_soon" | "overdue"

export interface BeCatalogueItem {
  code: string
  name: string
  jurisdiction?: string
  defaultValidityYears?: number | null
  dueSoonDays?: number
  description?: string
  reminderOffsetsDays?: number[]
}

export interface BeEvidence {
  id: string
  obligationId?: string
  filename?: string | null
  contentType?: string | null
  sizeBytes?: number | null
  storageKey?: string | null
  url?: string | null
  createdAt?: string | null
}

export interface BeReminder {
  id?: string
  obligationId?: string
  offsetCode?: string
  offsetDays?: number
  scheduledFor?: string
  status?: string
  channel?: string
  code?: string
  propertyId?: string
}

export interface BeObligation {
  id: string
  userId?: string
  propertyId: string
  code: string
  status: string
  issuedOn?: string | null
  expiresOn?: string | null
  notes?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  reminders?: BeReminder[]
  evidence?: BeEvidence[]
}

export interface BeDashboard {
  success?: boolean
  asOf?: string
  counts?: { valid?: number; due_soon?: number; overdue?: number }
  obligations?: BeObligation[]
  upcomingReminders?: BeReminder[]
}

export function isObligationCode(code: string): code is ObligationCode {
  return (OBLIGATION_CODES as readonly string[]).includes(code)
}

export function mapBeStatus(status: string | null | undefined): TrafficLight {
  switch (status) {
    case "valid":
      return "green"
    case "due_soon":
      return "amber"
    case "overdue":
      return "red"
    default:
      return "red"
  }
}

export function mapCatalogueItem(raw: unknown): ObligationDefinition | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as BeCatalogueItem
  const code = String(item.code ?? "").trim().toUpperCase()
  if (!isObligationCode(code)) return null
  const local = catalogueByCode(code) ?? COMPLIANCE_CATALOGUE[code]
  const years =
    typeof item.defaultValidityYears === "number" ? item.defaultValidityYears : null
  const typicalValidityMonths = years != null ? years * 12 : local.typicalValidityMonths
  const typicalValidity =
    years === 1
      ? "12 months"
      : years
        ? `${years} years`
        : local.typicalValidity
  return {
    code,
    name: item.name || local.name,
    shortName: local.shortName,
    typicalValidity,
    typicalValidityMonths,
    expiryModel: local.expiryModel,
    summary: item.description || local.summary,
    legalNote: local.legalNote,
    englandOnly: true,
  }
}

/**
 * Flask `GET /v1/compliance/catalogue` returns `{ items: [...] }`.
 * Also accepts the older `{ catalogue: [...] }` shape if seen in tests.
 */
export function mapCatalogueResponse(body: unknown): ObligationDefinition[] {
  if (!body || typeof body !== "object") return COMPLIANCE_CATALOGUE_LIST
  const rec = body as { items?: unknown; catalogue?: unknown }
  const list = Array.isArray(rec.items)
    ? rec.items
    : Array.isArray(rec.catalogue)
      ? rec.catalogue
      : null
  if (!list) return COMPLIANCE_CATALOGUE_LIST
  const mapped = list
    .map(mapCatalogueItem)
    .filter((row): row is ObligationDefinition => row != null)
  return mapped.length ? mapped : COMPLIANCE_CATALOGUE_LIST
}

export function reminderDaysFromCatalogue(body: unknown): number[] {
  if (!body || typeof body !== "object") return [90, 60, 30, 14, 7]
  const rec = body as { reminderOffsetsDays?: unknown; items?: BeCatalogueItem[] }
  const raw = Array.isArray(rec.reminderOffsetsDays)
    ? rec.reminderOffsetsDays
    : rec.items?.[0]?.reminderOffsetsDays
  if (!Array.isArray(raw)) return [90, 60, 30, 14, 7]
  const days = raw
    .map(Number)
    .filter((n) => Number.isFinite(n) && n < 0)
    .map((n) => Math.abs(n))
  return days.length ? days : [90, 60, 30, 14, 7]
}

export function mapEvidence(
  raw: BeEvidence,
  code: ObligationCode,
): EvidenceRecord {
  return {
    id: raw.id,
    obligationCode: code,
    filename: raw.filename ?? null,
    mimeType: raw.contentType ?? null,
    sizeBytes: raw.sizeBytes ?? null,
    issuedOn: null,
    expiresOn: null,
    notes: null,
    schemeRef: null,
    uploadedAt: raw.createdAt ?? new Date().toISOString(),
  }
}

export function mapObligationToState(
  item: BeObligation,
  now: Date = new Date(),
): ObligationState | null {
  const code = String(item.code ?? "").trim().toUpperCase()
  if (!isObligationCode(code)) return null
  const expiresOn = item.expiresOn || null
  const issuedOn = item.issuedOn || null
  const evidence = (item.evidence ?? []).map((ev) => mapEvidence(ev, code))
  return {
    code,
    instanceId: item.id,
    applicability: "required",
    notes: item.notes || null,
    issuedOn,
    expiresOn,
    evidence,
    status: mapBeStatus(item.status),
    daysUntilExpiry: expiresOn ? daysUntil(expiresOn, now) : null,
    latestExpiry: expiresOn,
  }
}

export function emptyObligationRow(
  code: ObligationCode,
  property: Pick<PropertyRef, "strategy" | "bedrooms">,
  _now: Date = new Date(),
): ObligationState {
  const applicability = defaultApplicability(code, property)
  const status: TrafficLight =
    applicability === "not_applicable"
      ? "na"
      : applicability === "unknown"
        ? "amber"
        : "red"
  return {
    code,
    instanceId: null,
    applicability,
    notes: null,
    issuedOn: null,
    expiresOn: null,
    evidence: [],
    status,
    daysUntilExpiry: null,
    latestExpiry: null,
  }
}

export function composePropertyFile(
  property: PropertyRef,
  obligations: BeObligation[],
  now: Date = new Date(),
): PropertyComplianceFile {
  const byCode = new Map<string, BeObligation>()
  for (const item of obligations) {
    const code = String(item.code ?? "").toUpperCase()
    const prev = byCode.get(code)
    if (!prev || String(item.updatedAt ?? "") > String(prev.updatedAt ?? "")) {
      byCode.set(code, item)
    }
  }
  const rows: ObligationState[] = OBLIGATION_CODES.map((code) => {
    const found = byCode.get(code)
    return found
      ? mapObligationToState(found, now)!
      : emptyObligationRow(code, property, now)
  })
  return {
    property,
    obligations: rows,
    overallStatus: overallStatus({ obligations: rows }),
    updatedAt: now.toISOString(),
  }
}

export function composeDashboard(
  properties: PropertyRef[],
  obligations: BeObligation[],
  now: Date = new Date(),
): ComplianceDashboard {
  const grouped = new Map<string, BeObligation[]>()
  for (const item of obligations) {
    const id = item.propertyId
    if (!id) continue
    const list = grouped.get(id) ?? []
    list.push(item)
    grouped.set(id, list)
  }
  const files = properties.map((property) =>
    composePropertyFile(property, grouped.get(property.propertyId) ?? [], now),
  )
  const counts = countByLight(files)
  return {
    jurisdiction: "england",
    unitCap: DEFAULT_UNIT_CAP,
    overCap: properties.length > DEFAULT_UNIT_CAP,
    summary: {
      properties: properties.length,
      ...counts,
    },
    properties: files.map((file) => ({
      property: file.property,
      overallStatus: file.overallStatus,
      lights: lightsMap(file),
      overdueCount: file.obligations.filter(
        (o) => o.status === "red" && o.daysUntilExpiry != null && o.daysUntilExpiry < 0,
      ).length,
      dueSoonCount: file.obligations.filter((o) => o.status === "amber").length,
      missingCount: file.obligations.filter(
        (o) =>
          o.applicability === "required" &&
          !o.issuedOn &&
          o.evidence.length === 0,
      ).length,
    })),
    source: "live",
  }
}

export function calendarFromAnalyzer(opts: {
  properties: PropertyRef[]
  obligations: BeObligation[]
  reminders: BeReminder[]
  from: string
  to: string
}): CalendarEvent[] {
  const byId = new Map(opts.properties.map((p) => [p.propertyId, p]))
  const events: CalendarEvent[] = []

  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false
    const day = iso.slice(0, 10)
    return day >= opts.from && day <= opts.to
  }

  for (const item of opts.obligations) {
    if (!isObligationCode(item.code)) continue
    const property = byId.get(item.propertyId)
    if (!property) continue
    const def = COMPLIANCE_CATALOGUE[item.code]
    const light = mapBeStatus(item.status)
    if (inRange(item.expiresOn) && light !== "na") {
      events.push({
        id: `${item.id}:expiry`,
        date: item.expiresOn!.slice(0, 10),
        kind: "expiry",
        propertyId: item.propertyId,
        address: property.address,
        nickname: property.nickname,
        obligationCode: item.code,
        obligationName: def.name,
        severity: light,
        label: `${def.shortName} expires`,
      })
    }
  }

  for (const rem of opts.reminders) {
    if (rem.status && rem.status !== "pending") continue
    if (!inRange(rem.scheduledFor)) continue
    const obligation = opts.obligations.find((o) => o.id === rem.obligationId)
    const propertyId = rem.propertyId || obligation?.propertyId
    if (!propertyId) continue
    const property = byId.get(propertyId)
    if (!property) continue
    const codeRaw = (rem.code || obligation?.code || "").toUpperCase()
    if (!isObligationCode(codeRaw)) continue
    const def = COMPLIANCE_CATALOGUE[codeRaw]
    const light = obligation ? mapBeStatus(obligation.status) : "amber"
    events.push({
      id: rem.id || `${propertyId}:${codeRaw}:${rem.scheduledFor}`,
      date: rem.scheduledFor!.slice(0, 10),
      kind: "reminder",
      propertyId,
      address: property.address,
      nickname: property.nickname,
      obligationCode: codeRaw,
      obligationName: def.name,
      severity: light === "green" ? "amber" : light,
      label: rem.offsetCode
        ? `${def.shortName} (${String(rem.offsetCode).replace(/_/g, " ")})`
        : `${def.shortName} reminder`,
    })
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}
