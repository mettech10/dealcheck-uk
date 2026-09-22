/**
 * Compliance Cockpit API client.
 *
 * Signed-in production/preview: Flask via `/api/compliance/*` is the only
 * store. Catalogue probe failure → fail-closed; never `createStubClient`.
 *
 * Stub (localStorage) is allowed only on localhost / 127.0.0.1, `?demo=1`
 * (already loopback-gated), or unit tests (`allowStub: true`).
 *
 * Live routes match metusa-deal-analyzer PR #93. See lib/compliance/API.md.
 */

import {
  calendarFromAnalyzer,
  composeDashboard,
  composePropertyFile,
  COMPLIANCE_COCKPIT_PATH,
  mapCatalogueResponse,
  reminderDaysFromCatalogue,
  type BeDashboard,
  type BeObligation,
  type BeReminder,
} from "./adapter"
import { isComplianceStubHost, isLocalComplianceDemo } from "./host"
import { createStubClient, type ComplianceApi } from "./stub"
import type {
  ObligationCode,
  PatchObligationInput,
  PropertyComplianceFile,
  PropertyRef,
  ReminderSettings,
  UploadEvidenceInput,
} from "./types"

export type ComplianceSource = "live" | "stub" | "unavailable"

export interface ComplianceClientHandle {
  api: ComplianceApi | null
  source: ComplianceSource
  error?: string
}

const BFF_PREFIX = "/api/compliance"

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (!text) return {} as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Compliance API returned non-JSON (${res.status})`)
  }
}

async function readJsonOrThrow<T>(
  res: Response,
  fallback: string,
): Promise<T> {
  const body = await parseJson<{ message?: string; error?: string } & T>(res)
  if (!res.ok) {
    const detail = body.message || body.error
    throw new Error(detail || `${fallback} (HTTP ${res.status})`)
  }
  return body as T
}

export async function liveFetch(
  path: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  return fetcher(`${BFF_PREFIX}${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  })
}

function createLiveClient(fetcher: typeof fetch = fetch): ComplianceApi {
  const getObligations = async (propertyId?: string): Promise<BeObligation[]> => {
    const qs = propertyId
      ? `?propertyId=${encodeURIComponent(propertyId)}`
      : ""
    const res = await liveFetch(`/obligations${qs}`, {}, fetcher)
    const body = await readJsonOrThrow<{ obligations?: BeObligation[] }>(
      res,
      "Failed to load obligations from the analyzer",
    )
    return body.obligations ?? []
  }

  const loadFile = async (property: PropertyRef): Promise<PropertyComplianceFile> => {
    const res = await liveFetch(
      `/properties/${encodeURIComponent(property.propertyId)}/obligations`,
      {},
      fetcher,
    )
    const body = await readJsonOrThrow<{ obligations?: BeObligation[] }>(
      res,
      "Failed to load property obligations",
    )
    return composePropertyFile(property, body.obligations ?? [])
  }

  const ensureInstance = async (
    propertyId: string,
    code: ObligationCode,
    extra: Record<string, unknown> = {},
  ): Promise<BeObligation> => {
    const existing = await getObligations(propertyId)
    const found = existing.find((o) => String(o.code).toUpperCase() === code)
    if (found) return found
    const res = await liveFetch(
      "/obligations",
      {
        method: "POST",
        body: JSON.stringify({ propertyId, code, ...extra }),
      },
      fetcher,
    )
    const body = await readJsonOrThrow<{ obligation: BeObligation }>(
      res,
      "Failed to create obligation",
    )
    return body.obligation
  }

  return {
    async getCatalogue() {
      const res = await liveFetch("/catalogue", {}, fetcher)
      return mapCatalogueResponse(
        await readJsonOrThrow(res, "Failed to load catalogue"),
      )
    },

    async getSettings() {
      const [catRes, remRes] = await Promise.all([
        liveFetch("/catalogue", {}, fetcher),
        liveFetch("/reminders", {}, fetcher),
      ])
      const catBody = await readJsonOrThrow(
        catRes,
        "Failed to load reminder catalogue",
      )
      const reminders = remRes.ok
        ? (await parseJson<{ reminders?: BeReminder[] }>(remRes)).reminders ?? []
        : []
      return {
        jurisdiction: "england" as const,
        reminderDays: reminderDaysFromCatalogue(catBody),
        emailEnabled: true,
        inAppEnabled: reminders.some((r) => r.channel === "in_app"),
        persistedBy: "analyzer" as const,
      }
    },

    async putSettings() {
      throw new Error(
        "Reminder offsets are owned by the analyzer (T-90…overdue). There is no PUT /v1/compliance/settings.",
      )
    },

    async upsertProperty(property) {
      // No PUT /properties/:id on Flask — link happens on POST /obligations
      // with propertyId. Opening a file is a GET of existing instances.
      return loadFile(property)
    },

    async getPropertyFile(propertyId) {
      const res = await liveFetch(
        `/properties/${encodeURIComponent(propertyId)}/obligations`,
        {},
        fetcher,
      )
      if (res.status === 404) return null
      const body = await readJsonOrThrow<{
        propertyId?: string
        obligations?: BeObligation[]
      }>(res, "Failed to load compliance file")
      const property: PropertyRef = {
        propertyId,
        address: propertyId,
        nickname: null,
        postcode: null,
        strategy: null,
        bedrooms: null,
      }
      return composePropertyFile(property, body.obligations ?? [])
    },

    async getDashboard(properties) {
      const res = await liveFetch("/dashboard", {}, fetcher)
      const body = await readJsonOrThrow<BeDashboard>(
        res,
        "Failed to load compliance dashboard",
      )
      return composeDashboard(properties, body.obligations ?? [])
    },

    async patchObligation(propertyId, code, patch: PatchObligationInput) {
      if (patch.applicability && patch.applicability !== "required") {
        throw new Error(
          "Applicability is not a Flask field. Not-applicable is not stored on the analyzer.",
        )
      }
      const instance = await ensureInstance(propertyId, code, {
        notes: patch.notes ?? "",
      })
      if (patch.notes != null) {
        const res = await liveFetch(
          `/obligations/${encodeURIComponent(instance.id)}`,
          { method: "PATCH", body: JSON.stringify({ notes: patch.notes }) },
          fetcher,
        )
        await readJsonOrThrow(res, "Failed to update obligation")
      }
      const property: PropertyRef = {
        propertyId,
        address: propertyId,
        nickname: null,
        postcode: null,
        strategy: null,
        bedrooms: null,
      }
      return loadFile(property)
    },

    async uploadEvidence(propertyId, code, input: UploadEvidenceInput) {
      const extra: Record<string, unknown> = {}
      if (input.issuedOn) extra.issuedOn = input.issuedOn
      if (input.expiresOn) extra.expiresOn = input.expiresOn
      if (input.notes) extra.notes = input.notes
      const instance = await ensureInstance(propertyId, code, extra)
      if (input.issuedOn || input.expiresOn || input.notes) {
        const res = await liveFetch(
          `/obligations/${encodeURIComponent(instance.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              issuedOn: input.issuedOn ?? undefined,
              expiresOn: input.expiresOn ?? undefined,
              notes: input.notes ?? undefined,
            }),
          },
          fetcher,
        )
        await readJsonOrThrow(res, "Failed to save certificate dates")
      }
      if (input.file) {
        const fd = new FormData()
        fd.append("file", input.file)
        const res = await liveFetch(
          `/obligations/${encodeURIComponent(instance.id)}/evidence`,
          { method: "POST", body: fd },
          fetcher,
        )
        await readJsonOrThrow(res, "Failed to upload evidence")
      }
      const property: PropertyRef = {
        propertyId,
        address: propertyId,
        nickname: null,
        postcode: null,
        strategy: null,
        bedrooms: null,
      }
      return loadFile(property)
    },

    async deleteEvidence() {
      throw new Error(
        "The analyzer has no DELETE evidence route. Remove is unavailable on the live store.",
      )
    },

    async getCalendar(properties, from, to) {
      const [dashRes, remRes] = await Promise.all([
        liveFetch("/dashboard", {}, fetcher),
        liveFetch("/reminders?status=pending", {}, fetcher),
      ])
      const dash = await readJsonOrThrow<BeDashboard>(
        dashRes,
        "Failed to load calendar",
      )
      const reminders = remRes.ok
        ? (await parseJson<{ reminders?: BeReminder[] }>(remRes)).reminders ?? []
        : dash.upcomingReminders ?? []
      return calendarFromAnalyzer({
        properties,
        obligations: dash.obligations ?? [],
        reminders,
        from,
        to,
      })
    },
  }
}

export function stubAllowed(opts: {
  allowStub?: boolean
  hostname?: string
  demo?: boolean
} = {}): boolean {
  // A concrete production/preview hostname can never use the stub —
  // not even if a caller passes allowStub. That flag is for Node unit
  // tests with no host (or loopback).
  if (opts.hostname && !isComplianceStubHost(opts.hostname)) return false
  if (opts.allowStub) return true
  return isComplianceStubHost(opts.hostname)
}

let cached: ComplianceClientHandle | null = null

/**
 * Resolve the cockpit store. Production/preview never construct the stub.
 */
export async function getComplianceClient(opts: {
  userId?: string
  force?: boolean
  allowStub?: boolean
  hostname?: string
  demo?: boolean
  fetch?: typeof fetch
} = {}): Promise<ComplianceClientHandle> {
  if (cached && !opts.force) return cached

  const hostname =
    opts.hostname ??
    (typeof window !== "undefined" ? window.location.hostname : "")
  const demo =
    opts.demo ??
    (typeof window !== "undefined" ? isLocalComplianceDemo() : false)
  const allow = stubAllowed({
    allowStub: opts.allowStub,
    hostname,
    demo,
  })
  const fetcher = opts.fetch ?? fetch

  if (demo && allow) {
    cached = {
      api: createStubClient({ userId: opts.userId ?? "local", hostname }),
      source: "stub",
    }
    return cached
  }

  try {
    const res = await liveFetch("/catalogue", {}, fetcher)
    if (res.ok) {
      cached = { api: createLiveClient(fetcher), source: "live" }
      return cached
    }
    const detail = `Analyzer catalogue returned HTTP ${res.status}`
    if (allow) {
      cached = {
        api: createStubClient({ userId: opts.userId ?? "local", hostname }),
        source: "stub",
        error: detail,
      }
      return cached
    }
    cached = {
      api: null,
      source: "unavailable",
      error: `${detail}. The cockpit did not fall back to a local store.`,
    }
    return cached
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analyzer unreachable"
    if (allow) {
      cached = {
        api: createStubClient({ userId: opts.userId ?? "local", hostname }),
        source: "stub",
        error: message,
      }
      return cached
    }
    cached = {
      api: null,
      source: "unavailable",
      error: `${message}. The cockpit did not fall back to a local store.`,
    }
    return cached
  }
}

export function resetComplianceClientCache() {
  cached = null
}

export { COMPLIANCE_COCKPIT_PATH }
export type { ComplianceApi }
