/**
 * Compliance Cockpit — shared types.
 *
 * England-only MVP for 1–20 unit landlords. Codes, traffic lights, and
 * REST shapes are the contract between the UI and `/v1/compliance/*`.
 * See lib/compliance/API.md for the expected backend.
 */

export const OBLIGATION_CODES = [
  "GAS",
  "EICR",
  "EPC",
  "DEP",
  "HTR",
  "LIC_HMO",
  "LIC_SEL",
] as const

export type ObligationCode = (typeof OBLIGATION_CODES)[number]

/** Traffic-light status for a single obligation or a whole property. */
export type TrafficLight = "green" | "amber" | "red" | "na"

export type Applicability = "required" | "not_applicable" | "unknown"

export type ExpiryModel = "fixed_term" | "tenancy" | "one_off"

export type Jurisdiction = "england"

export interface ObligationDefinition {
  code: ObligationCode
  name: string
  shortName: string
  /** Typical validity, e.g. "12 months". Null when tied to a tenancy / one-off. */
  typicalValidity: string | null
  /** Suggested months of validity when the landlord logs a new certificate. */
  typicalValidityMonths: number | null
  expiryModel: ExpiryModel
  summary: string
  legalNote: string
  englandOnly: true
}

export interface PropertyRef {
  propertyId: string
  address: string
  nickname: string | null
  postcode: string | null
  strategy: string | null
  bedrooms: number | null
}

export interface EvidenceRecord {
  id: string
  obligationCode: ObligationCode
  filename: string | null
  mimeType: string | null
  sizeBytes: number | null
  issuedOn: string | null
  expiresOn: string | null
  notes: string | null
  /** Tenancy deposit scheme reference (DEP only). */
  schemeRef: string | null
  uploadedAt: string
}

export interface ObligationState {
  code: ObligationCode
  applicability: Applicability
  notes: string | null
  evidence: EvidenceRecord[]
  /** Derived client-side (and echoed by BE when live). */
  status: TrafficLight
  daysUntilExpiry: number | null
  latestExpiry: string | null
}

export interface PropertyComplianceFile {
  property: PropertyRef
  obligations: ObligationState[]
  overallStatus: TrafficLight
  updatedAt: string
}

export interface PropertyComplianceSummary {
  property: PropertyRef
  overallStatus: TrafficLight
  lights: Record<ObligationCode, TrafficLight>
  overdueCount: number
  dueSoonCount: number
  missingCount: number
}

export interface ComplianceDashboard {
  jurisdiction: Jurisdiction
  unitCap: number
  overCap: boolean
  summary: {
    properties: number
    green: number
    amber: number
    red: number
    overdue: number
    dueSoon: number
    missing: number
  }
  properties: PropertyComplianceSummary[]
  source: "live" | "stub"
}

export interface CalendarEvent {
  id: string
  date: string
  kind: "expiry" | "reminder"
  propertyId: string
  address: string
  nickname: string | null
  obligationCode: ObligationCode
  obligationName: string
  severity: Exclude<TrafficLight, "na">
  label: string
}

export interface ReminderSettings {
  jurisdiction: Jurisdiction
  /** Days before expiry to fire a reminder. */
  reminderDays: number[]
  emailEnabled: boolean
  inAppEnabled: boolean
}

export interface UploadEvidenceInput {
  file?: File | null
  issuedOn?: string | null
  expiresOn?: string | null
  notes?: string | null
  schemeRef?: string | null
}

export interface PatchObligationInput {
  applicability?: Applicability
  notes?: string | null
}

export const DEFAULT_REMINDER_DAYS = [90, 60, 30, 7] as const
export const DEFAULT_UNIT_CAP = 20

export const DEFAULT_SETTINGS: ReminderSettings = {
  jurisdiction: "england",
  reminderDays: [...DEFAULT_REMINDER_DAYS],
  emailEnabled: true,
  inAppEnabled: true,
}
