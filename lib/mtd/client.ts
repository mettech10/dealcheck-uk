import type { MtdBusiness, MtdLedgerEntry, MtdPack, MtdProperty, MtdShareLink } from "./types"

async function parseJson(res: Response) {
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error((json as { error?: string }).error || `Request failed (${res.status})`)
    ;(err as Error & { status: number; code?: string }).status = res.status
    ;(err as Error & { status: number; code?: string }).code = (json as { code?: string }).code
    throw err
  }
  return json
}

export async function mtdFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }
  const res = await fetch(`/v1/mtd${path}`, { ...init, headers })
  return parseJson(res)
}

export async function fetchBusiness(): Promise<{ business: MtdBusiness; disclaimer: string }> {
  return mtdFetch("/business")
}

export async function fetchProperties(): Promise<{ properties: MtdProperty[] }> {
  return mtdFetch("/properties")
}

export async function fetchLedger(params?: {
  propertyId?: string
  taxYear?: string
  quarter?: string
}): Promise<{ entries: MtdLedgerEntry[]; properties: MtdProperty[] }> {
  const qs = new URLSearchParams()
  if (params?.propertyId) qs.set("propertyId", params.propertyId)
  if (params?.taxYear) qs.set("taxYear", params.taxYear)
  if (params?.quarter) qs.set("quarter", params.quarter)
  const suffix = qs.toString() ? `?${qs}` : ""
  return mtdFetch(`/ledger${suffix}`)
}

export async function createLedgerEntry(input: {
  propertyId: string
  entryDate: string
  amount: number
  categoryId: string
  description: string
  reference?: string
}): Promise<{ entry: MtdLedgerEntry }> {
  return mtdFetch("/ledger", { method: "POST", body: JSON.stringify(input) })
}

export async function deleteLedgerEntry(id: string): Promise<void> {
  await mtdFetch(`/ledger/${id}`, { method: "DELETE" })
}

export async function importLedgerRows(payload: {
  propertyId?: string
  rows: Array<{
    propertyId?: string
    entryDate: string
    amount: number
    categoryId: string
    description: string
    reference?: string | null
  }>
}): Promise<{ imported: number; errors: { index: number; error: string }[] }> {
  return mtdFetch("/ledger/import", { method: "POST", body: JSON.stringify(payload) })
}

export async function fetchPack(taxYear: string, quarter: string): Promise<{ pack: MtdPack }> {
  const qs = new URLSearchParams({ taxYear, quarter })
  return mtdFetch(`/pack?${qs}`)
}

export async function downloadPackFile(opts: {
  taxYear: string
  quarter: string
  format: "csv" | "json"
  token?: string
}): Promise<void> {
  const qs = new URLSearchParams({
    taxYear: opts.taxYear,
    quarter: opts.quarter,
    format: opts.format,
  })
  const url = opts.token
    ? `/v1/mtd/share/${encodeURIComponent(opts.token)}?${qs}`
    : `/v1/mtd/pack/download?${qs}`
  const res = await fetch(url)
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error((json as { error?: string }).error || "Download failed")
  }
  const blob = await res.blob()
  const disposition = res.headers.get("Content-Disposition") || ""
  const match = /filename="([^"]+)"/.exec(disposition)
  const filename = match?.[1] || `metalyzi-mtd-pack.${opts.format}`
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

export async function fetchShareLinks(): Promise<{ links: MtdShareLink[] }> {
  return mtdFetch("/share")
}

export async function createShareLink(input: {
  label?: string
  expiresInDays: number
}): Promise<{ link: MtdShareLink }> {
  return mtdFetch("/share", { method: "POST", body: JSON.stringify(input) })
}

export async function revokeShareLink(id: string): Promise<void> {
  await mtdFetch(`/share?id=${encodeURIComponent(id)}`, { method: "DELETE" })
}

export async function fetchSharedPack(token: string, taxYear: string, quarter: string) {
  const qs = new URLSearchParams({ taxYear, quarter })
  const res = await fetch(`/v1/mtd/share/${encodeURIComponent(token)}?${qs}`)
  return parseJson(res) as Promise<{
    pack: MtdPack
    business: { name: string; accounting_basis: string }
    label: string | null
    expires_at: string | null
    disclaimer: string
    hmrcSubmission: false
    readOnly: true
  }>
}
