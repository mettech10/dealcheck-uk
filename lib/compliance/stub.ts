/**
 * In-browser stub for `/v1/compliance/*` used when the backend has not
 * merged those routes yet. Persistence is localStorage keyed by user id
 * so two accounts on one machine do not share files. Tests inject memory.
 *
 * Linked to portfolio rows via `propertyId` (the portfolio_properties.id).
 */

import {
  COMPLIANCE_CATALOGUE_LIST,
  defaultApplicability,
} from "./catalogue"
import {
  countByLight,
  calendarEventsForFile,
  hydrateObligation,
  lightsMap,
  overallStatus,
  warnWindowDays,
} from "./status"
import {
  DEFAULT_SETTINGS,
  DEFAULT_UNIT_CAP,
  OBLIGATION_CODES,
  type CalendarEvent,
  type ComplianceDashboard,
  type ObligationCode,
  type ObligationDefinition,
  type ObligationState,
  type PatchObligationInput,
  type PropertyComplianceFile,
  type PropertyRef,
  type ReminderSettings,
  type UploadEvidenceInput,
} from "./types"

const STORAGE_PREFIX = "metalyzi.compliance.v1."

export interface StubSnapshot {
  version: 1
  settings: ReminderSettings
  files: Record<string, PropertyComplianceFile>
}

export interface ComplianceStorage {
  load(): StubSnapshot
  save(state: StubSnapshot): void
}

export function emptySnapshot(): StubSnapshot {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, files: {} }
}

export function memoryStorage(initial: StubSnapshot = emptySnapshot()): ComplianceStorage {
  let state = structuredClone(initial)
  return {
    load: () => structuredClone(state),
    save: (next) => {
      state = structuredClone(next)
    },
  }
}

export function localStorageStore(userId: string): ComplianceStorage {
  const key = `${STORAGE_PREFIX}${userId}`
  if (typeof window === "undefined") return memoryStorage()
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return emptySnapshot()
        const parsed = JSON.parse(raw) as StubSnapshot
        if (parsed?.version !== 1 || !parsed.files || !parsed.settings) {
          return emptySnapshot()
        }
        return parsed
      } catch {
        return emptySnapshot()
      }
    },
    save(state) {
      window.localStorage.setItem(key, JSON.stringify(state))
    },
  }
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function emptyObligations(
  property: PropertyRef,
  now: Date,
  warnDays: number,
): ObligationState[] {
  return OBLIGATION_CODES.map((code) =>
    hydrateObligation(
      {
        code,
        applicability: defaultApplicability(code, property),
        notes: null,
        evidence: [],
      },
      { now, warnDays },
    ),
  )
}

function rehydrateFile(
  file: PropertyComplianceFile,
  now: Date,
  warnDays: number,
): PropertyComplianceFile {
  const obligations = file.obligations.map((row) =>
    hydrateObligation(
      {
        code: row.code,
        applicability: row.applicability,
        notes: row.notes,
        evidence: row.evidence,
      },
      { now, warnDays },
    ),
  )
  return {
    ...file,
    obligations,
    overallStatus: overallStatus({ obligations }),
  }
}

function ensureFile(
  state: StubSnapshot,
  property: PropertyRef,
  now: Date,
): PropertyComplianceFile {
  const warnDays = warnWindowDays(state.settings)
  const existing = state.files[property.propertyId]
  if (existing) {
    const merged: PropertyComplianceFile = {
      ...existing,
      property: { ...existing.property, ...property },
    }
    const next = rehydrateFile(merged, now, warnDays)
    state.files[property.propertyId] = next
    return next
  }
  const obligations = emptyObligations(property, now, warnDays)
  const created: PropertyComplianceFile = {
    property,
    obligations,
    overallStatus: overallStatus({ obligations }),
    updatedAt: now.toISOString(),
  }
  state.files[property.propertyId] = created
  return created
}

export interface ComplianceApi {
  getCatalogue(): Promise<ObligationDefinition[]>
  getSettings(): Promise<ReminderSettings>
  putSettings(settings: Partial<ReminderSettings>): Promise<ReminderSettings>
  upsertProperty(property: PropertyRef): Promise<PropertyComplianceFile>
  getPropertyFile(propertyId: string): Promise<PropertyComplianceFile | null>
  getDashboard(properties: PropertyRef[]): Promise<ComplianceDashboard>
  patchObligation(
    propertyId: string,
    code: ObligationCode,
    patch: PatchObligationInput,
  ): Promise<PropertyComplianceFile>
  uploadEvidence(
    propertyId: string,
    code: ObligationCode,
    input: UploadEvidenceInput,
  ): Promise<PropertyComplianceFile>
  deleteEvidence(
    propertyId: string,
    code: ObligationCode,
    evidenceId: string,
  ): Promise<PropertyComplianceFile>
  getCalendar(properties: PropertyRef[], from: string, to: string): Promise<CalendarEvent[]>
}

export function createStubClient(opts: {
  userId?: string
  storage?: ComplianceStorage
  now?: () => Date
} = {}): ComplianceApi {
  const storage = opts.storage ?? localStorageStore(opts.userId ?? "local")
  const nowFn = opts.now ?? (() => new Date())

  const mutate = (fn: (state: StubSnapshot) => PropertyComplianceFile | ReminderSettings | CalendarEvent[] | ComplianceDashboard) => {
    const state = storage.load()
    const result = fn(state)
    storage.save(state)
    return result
  }

  return {
    async getCatalogue() {
      return COMPLIANCE_CATALOGUE_LIST
    },

    async getSettings() {
      return storage.load().settings
    },

    async putSettings(patch) {
      return mutate((state) => {
        const reminderDays = (patch.reminderDays ?? state.settings.reminderDays)
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0)
          .sort((a, b) => b - a)
        state.settings = {
          jurisdiction: "england",
          reminderDays: reminderDays.length ? reminderDays : [...DEFAULT_SETTINGS.reminderDays],
          emailEnabled: patch.emailEnabled ?? state.settings.emailEnabled,
          inAppEnabled: patch.inAppEnabled ?? state.settings.inAppEnabled,
        }
        for (const id of Object.keys(state.files)) {
          state.files[id] = rehydrateFile(state.files[id], nowFn(), warnWindowDays(state.settings))
        }
        return state.settings
      }) as ReminderSettings
    },

    async upsertProperty(property) {
      return mutate((state) => ensureFile(state, property, nowFn())) as PropertyComplianceFile
    },

    async getPropertyFile(propertyId) {
      const state = storage.load()
      const file = state.files[propertyId]
      if (!file) return null
      return rehydrateFile(file, nowFn(), warnWindowDays(state.settings))
    },

    async getDashboard(properties) {
      const state = storage.load()
      const now = nowFn()
      const files = properties.map((p) => ensureFile(state, p, now))
      storage.save(state)
      const counts = countByLight(files)
      const overCap = properties.length > DEFAULT_UNIT_CAP
      return {
        jurisdiction: "england",
        unitCap: DEFAULT_UNIT_CAP,
        overCap,
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
          dueSoonCount: file.obligations.filter(
            (o) => o.status === "amber" && o.daysUntilExpiry != null && o.daysUntilExpiry >= 0,
          ).length,
          missingCount: file.obligations.filter(
            (o) => o.applicability === "required" && o.evidence.length === 0,
          ).length,
        })),
        source: "stub",
      }
    },

    async patchObligation(propertyId, code, patch) {
      return mutate((state) => {
        const file = state.files[propertyId]
        if (!file) throw new Error("Property compliance file not found")
        const now = nowFn()
        const warnDays = warnWindowDays(state.settings)
        const obligations = file.obligations.map((row) => {
          if (row.code !== code) return hydrateObligation(row, { now, warnDays })
          return hydrateObligation(
            {
              ...row,
              applicability: patch.applicability ?? row.applicability,
              notes: patch.notes === undefined ? row.notes : patch.notes,
            },
            { now, warnDays },
          )
        })
        const next: PropertyComplianceFile = {
          ...file,
          obligations,
          overallStatus: overallStatus({ obligations }),
          updatedAt: now.toISOString(),
        }
        state.files[propertyId] = next
        return next
      }) as PropertyComplianceFile
    },

    async uploadEvidence(propertyId, code, input) {
      return mutate((state) => {
        const file = state.files[propertyId]
        if (!file) throw new Error("Property compliance file not found")
        const now = nowFn()
        const warnDays = warnWindowDays(state.settings)
        const record = {
          id: newId("ev"),
          obligationCode: code,
          filename: input.file?.name ?? null,
          mimeType: input.file?.type || null,
          sizeBytes: input.file?.size ?? null,
          issuedOn: input.issuedOn || null,
          expiresOn: input.expiresOn || null,
          notes: input.notes || null,
          schemeRef: input.schemeRef || null,
          uploadedAt: now.toISOString(),
        }
        const obligations = file.obligations.map((row) => {
          if (row.code !== code) return hydrateObligation(row, { now, warnDays })
          return hydrateObligation(
            { ...row, evidence: [...row.evidence, record] },
            { now, warnDays },
          )
        })
        const next: PropertyComplianceFile = {
          ...file,
          obligations,
          overallStatus: overallStatus({ obligations }),
          updatedAt: now.toISOString(),
        }
        state.files[propertyId] = next
        return next
      }) as PropertyComplianceFile
    },

    async deleteEvidence(propertyId, code, evidenceId) {
      return mutate((state) => {
        const file = state.files[propertyId]
        if (!file) throw new Error("Property compliance file not found")
        const now = nowFn()
        const warnDays = warnWindowDays(state.settings)
        const obligations = file.obligations.map((row) => {
          if (row.code !== code) return hydrateObligation(row, { now, warnDays })
          return hydrateObligation(
            { ...row, evidence: row.evidence.filter((e) => e.id !== evidenceId) },
            { now, warnDays },
          )
        })
        const next: PropertyComplianceFile = {
          ...file,
          obligations,
          overallStatus: overallStatus({ obligations }),
          updatedAt: now.toISOString(),
        }
        state.files[propertyId] = next
        return next
      }) as PropertyComplianceFile
    },

    async getCalendar(properties, from, to) {
      const state = storage.load()
      const now = nowFn()
      const files = properties.map((p) => {
        const file = state.files[p.propertyId]
        return file ? rehydrateFile(file, now, warnWindowDays(state.settings)) : null
      })
      const events: CalendarEvent[] = []
      for (const file of files) {
        if (!file) continue
        events.push(...calendarEventsForFile(file, state.settings, { from, to }))
      }
      return events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    },
  }
}
