/**
 * Compliance Cockpit API client.
 *
 * Talks to the Next BFF at `/api/compliance/*`, which proxies
 * `${BACKEND_API_URL}/v1/compliance/*`. When the backend routes are
 * missing (404/501/network), the same interface is served by the
 * localStorage stub so the UI can ship before BE merge.
 *
 * See lib/compliance/API.md for the expected live contract.
 */

import { COMPLIANCE_CATALOGUE_LIST } from "./catalogue"
import { createStubClient, type ComplianceApi } from "./stub"
import type {
  CalendarEvent,
  ComplianceDashboard,
  ObligationCode,
  PatchObligationInput,
  PropertyComplianceFile,
  PropertyRef,
  ReminderSettings,
  UploadEvidenceInput,
} from "./types"

export type ComplianceSource = "live" | "stub"

export interface ComplianceClientHandle {
  api: ComplianceApi
  source: ComplianceSource
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

function isStubSignal(res: Response): boolean {
  if (res.status === 404 || res.status === 501 || res.status === 502 || res.status === 503) {
    return true
  }
  const source = res.headers.get("x-compliance-source")
  return source === "stub" || source === "unavailable"
}

async function liveFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  return fetch(`${BFF_PREFIX}${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  })
}

function createLiveClient(): ComplianceApi {
  return {
    async getCatalogue() {
      const res = await liveFetch("/catalogue")
      if (!res.ok) throw new Error("Failed to load catalogue")
      const body = await parseJson<{ catalogue?: typeof COMPLIANCE_CATALOGUE_LIST }>(res)
      return body.catalogue ?? COMPLIANCE_CATALOGUE_LIST
    },

    async getSettings() {
      const res = await liveFetch("/settings")
      if (!res.ok) throw new Error("Failed to load reminder settings")
      return parseJson<ReminderSettings>(res)
    },

    async putSettings(settings) {
      const res = await liveFetch("/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error("Failed to save reminder settings")
      return parseJson<ReminderSettings>(res)
    },

    async upsertProperty(property) {
      const res = await liveFetch(`/properties/${encodeURIComponent(property.propertyId)}`, {
        method: "PUT",
        body: JSON.stringify(property),
      })
      if (!res.ok) throw new Error("Failed to link property")
      return parseJson<PropertyComplianceFile>(res)
    },

    async getPropertyFile(propertyId) {
      const res = await liveFetch(`/properties/${encodeURIComponent(propertyId)}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error("Failed to load compliance file")
      return parseJson<PropertyComplianceFile>(res)
    },

    async getDashboard(properties) {
      const res = await liveFetch("/dashboard", {
        method: "POST",
        body: JSON.stringify({ properties }),
      })
      if (!res.ok) throw new Error("Failed to load compliance dashboard")
      const body = await parseJson<ComplianceDashboard>(res)
      return { ...body, source: "live" }
    },

    async patchObligation(propertyId, code, patch: PatchObligationInput) {
      const res = await liveFetch(
        `/properties/${encodeURIComponent(propertyId)}/obligations/${encodeURIComponent(code)}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      )
      if (!res.ok) throw new Error("Failed to update obligation")
      return parseJson<PropertyComplianceFile>(res)
    },

    async uploadEvidence(propertyId, code, input: UploadEvidenceInput) {
      const fd = new FormData()
      if (input.file) fd.append("file", input.file)
      if (input.issuedOn) fd.append("issuedOn", input.issuedOn)
      if (input.expiresOn) fd.append("expiresOn", input.expiresOn)
      if (input.notes) fd.append("notes", input.notes)
      if (input.schemeRef) fd.append("schemeRef", input.schemeRef)
      const res = await liveFetch(
        `/properties/${encodeURIComponent(propertyId)}/obligations/${encodeURIComponent(code)}/evidence`,
        { method: "POST", body: fd },
      )
      if (!res.ok) throw new Error("Failed to upload evidence")
      return parseJson<PropertyComplianceFile>(res)
    },

    async deleteEvidence(propertyId, code, evidenceId) {
      const res = await liveFetch(
        `/properties/${encodeURIComponent(propertyId)}/obligations/${encodeURIComponent(code)}/evidence/${encodeURIComponent(evidenceId)}`,
        { method: "DELETE" },
      )
      if (!res.ok) throw new Error("Failed to remove evidence")
      return parseJson<PropertyComplianceFile>(res)
    },

    async getCalendar(properties, from, to) {
      const qs = new URLSearchParams({ from, to })
      const res = await liveFetch(`/calendar?${qs.toString()}`, {
        method: "POST",
        body: JSON.stringify({ properties }),
      })
      if (!res.ok) throw new Error("Failed to load calendar")
      const body = await parseJson<{ events?: CalendarEvent[] }>(res)
      return body.events ?? []
    },
  }
}

let cached: ComplianceClientHandle | null = null

/**
 * Probe the BFF once per session. Cached so tab switches don't re-probe.
 * Pass `force: true` after login if the user id just became known.
 */
export async function getComplianceClient(opts: {
  userId?: string
  force?: boolean
} = {}): Promise<ComplianceClientHandle> {
  if (cached && !opts.force) return cached

  try {
    const res = await liveFetch("/catalogue")
    if (res.ok && !isStubSignal(res)) {
      cached = { api: createLiveClient(), source: "live" }
      return cached
    }
  } catch {
    // Backend not merged / offline — fall through to stub.
  }

  cached = {
    api: createStubClient({ userId: opts.userId ?? "local" }),
    source: "stub",
  }
  return cached
}

export function resetComplianceClientCache() {
  cached = null
}

export type { ComplianceApi }
