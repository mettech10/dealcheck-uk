/**
 * Browser client for the canonical Flask MTD API (`/v1/mtd/*`).
 * Ledger writes go to Flask with Bearer auth — never a Next mtd_* table.
 */

import { flaskMtdUrl, flaskPropertyLinkBody, requirePlatformPropertyId } from "./config"
import { csvTemplate } from "./csv"
import { poundsToPence, requireAmountPence } from "./money"
import { currentTaxYear, toIsoDate } from "./taxYear"
import type {
  FlaskBusiness,
  FlaskCsvPreview,
  FlaskLedgerEntry,
  FlaskMtdProperty,
  FlaskQuarterPack,
  FlaskShareLink,
  PortfolioProperty,
} from "./types"

let cachedToken: string | null = null

async function parseJson(res: Response) {
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error((json as { error?: string }).error || `Request failed (${res.status})`)
    ;(err as Error & { status: number }).status = res.status
    throw err
  }
  return json
}

export async function getFlaskBearer(): Promise<string> {
  if (cachedToken) return cachedToken
  const res = await fetch("/api/mtd/token")
  const json = await parseJson(res)
  cachedToken = json.accessToken as string
  return cachedToken
}

export function clearFlaskBearer() {
  cachedToken = null
}

export async function flaskFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getFlaskBearer()
  const headers = new Headers(init?.headers)
  headers.set("Authorization", `Bearer ${token}`)
  if (init?.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }
  const res = await fetch(flaskMtdUrl(path), { ...init, headers, credentials: "omit" })
  if (res.status === 401) {
    cachedToken = null
  }
  return res
}

export async function flaskJson<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<T> {
  const res = await flaskFetch(path, init)
  if (res.status === 401) {
    const retryToken = await getFlaskBearer()
    const headers = new Headers(init?.headers)
    headers.set("Authorization", `Bearer ${retryToken}`)
    if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json")
    const retry = await fetch(flaskMtdUrl(path), { ...init, headers, credentials: "omit" })
    return parseJson(retry) as Promise<T>
  }
  return parseJson(res) as Promise<T>
}

export async function fetchPortfolioProperties(): Promise<PortfolioProperty[]> {
  const res = await fetch("/api/portfolio")
  if (res.status === 401) {
    const err = new Error("Unauthorized") as Error & { status: number }
    err.status = 401
    throw err
  }
  const json = await parseJson(res)
  return ((json.properties || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    nickname: (row.nickname as string | null) ?? null,
    address: String(row.address ?? ""),
    postcode: (row.postcode as string | null) ?? null,
    strategy: (row.strategy as string | null) ?? null,
    status: (row.status as string | null) ?? null,
  }))
}

export async function ensureBusiness(): Promise<FlaskBusiness> {
  const listed = await flaskJson<{ businesses: FlaskBusiness[] }>("/businesses")
  if (listed.businesses?.length) return listed.businesses[0]
  return flaskJson<FlaskBusiness>("/businesses", {
    method: "POST",
    body: JSON.stringify({
      name: "UK property business",
      taxYearStart: toIsoDate(currentTaxYear().start),
      basis: "standard",
      country: "uk",
    }),
  })
}

export async function updateBusiness(
  businessId: string,
  patch: { name?: string },
): Promise<FlaskBusiness> {
  return flaskJson<FlaskBusiness>(`/businesses/${businessId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
}

export async function getPack(packId: string): Promise<FlaskQuarterPack> {
  return flaskJson<FlaskQuarterPack>(`/packs/${packId}`)
}

export async function listFlaskProperties(businessId: string): Promise<FlaskMtdProperty[]> {
  const j = await flaskJson<{ properties: FlaskMtdProperty[] }>(
    `/businesses/${businessId}/properties`,
  )
  return j.properties || []
}

export async function linkPlatformProperty(opts: {
  businessId: string
  propertyId: string
  label: string
  address?: string | null
  postcode?: string | null
}): Promise<FlaskMtdProperty> {
  const body = flaskPropertyLinkBody({
    propertyId: opts.propertyId,
    label: opts.label,
    address: opts.address,
    postcode: opts.postcode,
  })
  const existing = await listFlaskProperties(opts.businessId)
  const found = existing.find((p) => p.propertyId === body.propertyId)
  if (found) return found
  return flaskJson<FlaskMtdProperty>(`/businesses/${opts.businessId}/properties`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export async function listLedger(businessId: string): Promise<FlaskLedgerEntry[]> {
  const j = await flaskJson<{ entries: FlaskLedgerEntry[] }>(
    `/businesses/${businessId}/ledger`,
  )
  return j.entries || []
}

export async function createLedgerEntry(input: {
  businessId: string
  platformPropertyId: string
  date: string
  amountPounds: string | number
  categoryCode: string
  description: string
  reference?: string
}): Promise<FlaskLedgerEntry> {
  const platformPropertyId = requirePlatformPropertyId(input.platformPropertyId)
  const portfolio = await fetchPortfolioProperties()
  const prop = portfolio.find((p) => p.id === platformPropertyId)
  if (!prop) throw new Error("propertyId was not found in your Metalyzi portfolio.")
  const linked = await linkPlatformProperty({
    businessId: input.businessId,
    propertyId: platformPropertyId,
    label: prop.nickname || prop.address,
    address: prop.address,
    postcode: prop.postcode,
  })
  const amountPence = poundsToPence(input.amountPounds)
  requireAmountPence(amountPence)
  // Ledger row uses the Flask MTD property PK. Platform UUID was passed
  // through on link (`propertyId` / `property_id`) and must not be used
  // as a second ledger schema.
  return flaskJson<FlaskLedgerEntry>(`/businesses/${input.businessId}/ledger`, {
    method: "POST",
    body: JSON.stringify({
      date: input.date,
      propertyId: linked.id,
      property_id: linked.id,
      categoryCode: input.categoryCode,
      amountPence,
      description: input.description,
      counterparty: input.reference || null,
      source: "manual",
    }),
  })
}

export async function deleteLedgerEntry(id: string): Promise<void> {
  await flaskJson(`/ledger/${id}`, { method: "DELETE" })
}

export async function previewCsv(businessId: string, csv: string, filename?: string) {
  return flaskJson<FlaskCsvPreview>(`/businesses/${businessId}/imports/preview`, {
    method: "POST",
    body: JSON.stringify({ csv, filename: filename || "import.csv" }),
  })
}

export async function commitCsv(businessId: string, csv: string, filename?: string) {
  return flaskJson<{
    idempotent: boolean
    createdCount: number
    skippedCount: number
  }>(`/businesses/${businessId}/imports/commit`, {
    method: "POST",
    body: JSON.stringify({ csv, filename: filename || "import.csv" }),
  })
}

export async function listPacks(businessId: string): Promise<FlaskQuarterPack[]> {
  const j = await flaskJson<{ packs: FlaskQuarterPack[] }>(
    `/businesses/${businessId}/packs`,
  )
  return j.packs || []
}

export async function ensureQuarterPack(
  businessId: string,
  taxYear: string,
  quarter: number,
): Promise<FlaskQuarterPack> {
  const existing = await listPacks(businessId)
  const found = existing.find((p) => p.taxYear === taxYear && p.quarter === quarter)
  if (found) {
    return flaskJson<FlaskQuarterPack>(`/packs/${found.id}`)
  }
  try {
    return await flaskJson<FlaskQuarterPack>(`/businesses/${businessId}/packs`, {
      method: "POST",
      body: JSON.stringify({ taxYear, quarter, basis: "standard" }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ""
    if (/409|already|exist/i.test(msg)) {
      const again = await listPacks(businessId)
      const hit = again.find((p) => p.taxYear === taxYear && p.quarter === quarter)
      if (hit) return flaskJson<FlaskQuarterPack>(`/packs/${hit.id}`)
    }
    throw e
  }
}

export async function downloadPackExport(
  packId: string,
  format: "csv" | "json" | "pdf",
): Promise<void> {
  const res = await flaskFetch(`/packs/${packId}/export.${format}`)
  if (!res.ok) {
    await parseJson(res)
    return
  }
  await saveBlob(res, `mtd-pack.${format}`)
}

export async function createShareLink(packId: string, expiresInDays: number) {
  const link = await flaskJson<FlaskShareLink>(`/packs/${packId}/share`, {
    method: "POST",
    body: JSON.stringify({ expiresInDays }),
  })
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  return {
    ...link,
    url: `${origin}/mtd/share/${link.token}`,
  }
}

export async function revokeShareLink(id: string): Promise<void> {
  await flaskJson(`/share-links/${id}`, { method: "DELETE" })
}

export async function fetchSharedPack(token: string) {
  const res = await fetch(`/v1/mtd/share/${encodeURIComponent(token)}`)
  return parseJson(res) as Promise<{
    readonly: true
    immutable: true
    hmrcSubmit: false
    pack: FlaskQuarterPack
  }>
}

export async function downloadSharedPack(token: string, format: "csv" | "json" | "pdf") {
  const res = await fetch(`/v1/mtd/share/${encodeURIComponent(token)}?format=${format}`)
  if (!res.ok) {
    await parseJson(res)
    return
  }
  await saveBlob(res, `mtd-pack.${format}`)
}

export function downloadCsvTemplate() {
  const blob = new Blob([csvTemplate()], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "metalyzi-mtd-ledger-template.csv"
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function saveBlob(res: Response, fallback: string) {
  const blob = await res.blob()
  const disposition = res.headers.get("Content-Disposition") || ""
  const match = /filename="([^"]+)"/.exec(disposition)
  const filename = match?.[1] || fallback
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

