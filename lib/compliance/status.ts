/**
 * Pure traffic-light + calendar derivation for the Compliance Cockpit.
 *
 * Rules (England MVP):
 *   na     — marked not applicable
 *   red    — required and missing, or latest evidence expired
 *   amber  — applicability unknown, or expires within the warn window
 *   green  — required, evidence present, and (if dated) expiry beyond warn window
 *
 * Property overall = worst of its applicable rows (na ignored).
 * unknown counts as amber so “check the council” stays visible.
 */

import { COMPLIANCE_CATALOGUE } from "./catalogue"
import type {
  CalendarEvent,
  ObligationCode,
  ObligationState,
  PropertyComplianceFile,
  PropertyRef,
  ReminderSettings,
  TrafficLight,
} from "./types"

const DAY_MS = 86_400_000

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Strict `YYYY-MM-DD` only — rejects locale strings that would map to 1900s. */
export function tryParseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const date = parseIsoDate(iso)
  if (Number.isNaN(date.getTime())) return null
  if (toIsoDate(date) !== iso) return null
  return date
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return startOfDay(next)
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return startOfDay(next)
}

export function daysUntil(iso: string, now: Date = new Date()): number {
  const target = startOfDay(parseIsoDate(iso))
  const today = startOfDay(now)
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}

export function warnWindowDays(settings: Pick<ReminderSettings, "reminderDays">): number {
  const days = settings.reminderDays.filter((n) => Number.isFinite(n) && n > 0)
  return days.length ? Math.max(...days) : 60
}

export function latestEvidence(obligation: Pick<ObligationState, "evidence">) {
  if (!obligation.evidence.length) return null
  return [...obligation.evidence].sort((a, b) => {
    const ae = a.expiresOn ?? a.uploadedAt
    const be = b.expiresOn ?? b.uploadedAt
    return be.localeCompare(ae)
  })[0]
}

export function deriveObligationStatus(
  obligation: Pick<ObligationState, "applicability" | "evidence">,
  opts: { now?: Date; warnDays?: number } = {},
): Pick<ObligationState, "status" | "daysUntilExpiry" | "latestExpiry"> {
  const now = opts.now ?? new Date()
  const warnDays = opts.warnDays ?? 60

  if (obligation.applicability === "not_applicable") {
    return { status: "na", daysUntilExpiry: null, latestExpiry: null }
  }

  const latest = latestEvidence(obligation)
  const latestExpiry = latest?.expiresOn ?? null
  const daysUntilExpiry = latestExpiry != null ? daysUntil(latestExpiry, now) : null

  if (obligation.applicability === "unknown") {
    return { status: "amber", daysUntilExpiry, latestExpiry }
  }

  if (!latest) {
    return { status: "red", daysUntilExpiry: null, latestExpiry: null }
  }

  if (daysUntilExpiry != null) {
    if (daysUntilExpiry < 0) {
      return { status: "red", daysUntilExpiry, latestExpiry }
    }
    if (daysUntilExpiry <= warnDays) {
      return { status: "amber", daysUntilExpiry, latestExpiry }
    }
    return { status: "green", daysUntilExpiry, latestExpiry }
  }

  // Evidence logged with no expiry (How to Rent / deposit without tenancy end).
  return { status: "green", daysUntilExpiry: null, latestExpiry: null }
}

const RANK: Record<TrafficLight, number> = {
  red: 3,
  amber: 2,
  green: 1,
  na: 0,
}

export function rollupStatus(lights: TrafficLight[]): TrafficLight {
  const applicable = lights.filter((l) => l !== "na")
  if (!applicable.length) return "na"
  return applicable.reduce((worst, light) =>
    RANK[light] > RANK[worst] ? light : worst,
  )
}

export function hydrateObligation(
  obligation: Omit<ObligationState, "status" | "daysUntilExpiry" | "latestExpiry">,
  opts: { now?: Date; warnDays?: number } = {},
): ObligationState {
  const derived = deriveObligationStatus(obligation, opts)
  return { ...obligation, ...derived }
}

export function overallStatus(file: Pick<PropertyComplianceFile, "obligations">): TrafficLight {
  return rollupStatus(file.obligations.map((o) => o.status))
}

export function countByLight(files: PropertyComplianceFile[]): {
  green: number
  amber: number
  red: number
  overdue: number
  dueSoon: number
  missing: number
} {
  let green = 0
  let amber = 0
  let red = 0
  let overdue = 0
  let dueSoon = 0
  let missing = 0
  for (const file of files) {
    const overall = overallStatus(file)
    if (overall === "green") green += 1
    else if (overall === "amber") amber += 1
    else if (overall === "red") red += 1
    for (const row of file.obligations) {
      if (row.applicability === "not_applicable") continue
      if (row.applicability === "required" && row.evidence.length === 0) missing += 1
      if (row.status === "red" && row.daysUntilExpiry != null && row.daysUntilExpiry < 0) {
        overdue += 1
      }
      if (row.status === "amber" && row.daysUntilExpiry != null && row.daysUntilExpiry >= 0) {
        dueSoon += 1
      }
    }
  }
  return { green, amber, red, overdue, dueSoon, missing }
}

export function lightsMap(
  file: Pick<PropertyComplianceFile, "obligations">,
): Record<ObligationCode, TrafficLight> {
  const out = {} as Record<ObligationCode, TrafficLight>
  for (const row of file.obligations) out[row.code] = row.status
  return out
}

export function calendarEventsForFile(
  file: PropertyComplianceFile,
  settings: Pick<ReminderSettings, "reminderDays">,
  range?: { from: string; to: string },
): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const from = range ? parseIsoDate(range.from) : null
  const to = range ? parseIsoDate(range.to) : null

  const inRange = (iso: string) => {
    if (!from || !to) return true
    const d = parseIsoDate(iso)
    return d >= from && d <= to
  }

  for (const row of file.obligations) {
    if (row.applicability === "not_applicable") continue
    const def = COMPLIANCE_CATALOGUE[row.code]
    const latest = latestEvidence(row)
    if (!latest?.expiresOn) continue

    const expiryDays = daysUntil(latest.expiresOn)
    const expirySeverity: Exclude<TrafficLight, "na"> =
      expiryDays < 0 ? "red" : expiryDays <= warnWindowDays(settings) ? "amber" : "green"

    if (inRange(latest.expiresOn)) {
      events.push({
        id: `${file.property.propertyId}:${row.code}:expiry:${latest.id}`,
        date: latest.expiresOn,
        kind: "expiry",
        propertyId: file.property.propertyId,
        address: file.property.address,
        nickname: file.property.nickname,
        obligationCode: row.code,
        obligationName: def.name,
        severity: expirySeverity,
        label: `${def.shortName} expires`,
      })
    }

    for (const days of settings.reminderDays) {
      const reminderDate = toIsoDate(addDays(parseIsoDate(latest.expiresOn), -days))
      if (!inRange(reminderDate)) continue
      // Don't emit reminders after the expiry has already passed relative to the reminder day.
      events.push({
        id: `${file.property.propertyId}:${row.code}:reminder:${days}:${latest.id}`,
        date: reminderDate,
        kind: "reminder",
        propertyId: file.property.propertyId,
        address: file.property.address,
        nickname: file.property.nickname,
        obligationCode: row.code,
        obligationName: def.name,
        severity: expirySeverity === "green" ? "amber" : expirySeverity,
        label: `${def.shortName} reminder (${days} days)`,
      })
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

export function propertyLabel(property: Pick<PropertyRef, "nickname" | "address">): string {
  return property.nickname?.trim() || property.address
}
