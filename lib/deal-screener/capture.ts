/**
 * Rightmove PAGE_MODEL decode + field pick — no photo URLs.
 *
 * Mirrors lib/scrapers/rightmove-listing-scraper.ts (PAGE_MODEL then DOM)
 * but runs on a plain object so unit tests don't need a browser, and the
 * Chrome extension can collect in the page MAIN world then normalise here.
 */

import { emptyCollectedPage } from "./normalize"
import type { CollectedRightmovePage } from "./types"

/** devalue-style index encoding used by window.__PAGE_MODEL.data */
export function decodeIndexedPageModel(rawStr: string): unknown {
  const arr = JSON.parse(rawStr) as unknown[]
  const cache = new Map<number, unknown>()
  const decode = (i: unknown): unknown => {
    if (typeof i !== "number") return i
    if (i === -1) return undefined
    if (i === -2) return Number.NaN
    if (i === -3) return Infinity
    if (i === -4) return -Infinity
    if (i === -5) return -0
    if (cache.has(i)) return cache.get(i)
    const node = arr[i]
    if (node === null || typeof node !== "object") {
      cache.set(i, node)
      return node
    }
    if (Array.isArray(node)) {
      const list: unknown[] = []
      cache.set(i, list)
      for (const el of node) list.push(decode(el))
      return list
    }
    const obj: Record<string, unknown> = {}
    cache.set(i, obj)
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      obj[k] = decode(v)
    }
    return obj
  }
  return decode(0)
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

function str(v: unknown): string {
  return v == null ? "" : String(v)
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function pickPropertyData(
  pageModel: unknown,
  encodedPageModel: unknown,
): Record<string, unknown> | null {
  const direct = asRecord(pageModel)
  const fromDirect = direct ? asRecord(direct.propertyData) : null
  if (fromDirect) return fromDirect

  const encoded = asRecord(encodedPageModel)
  if (encoded && typeof encoded.data === "string") {
    try {
      const decoded = asRecord(decodeIndexedPageModel(encoded.data))
      const pd = decoded ? asRecord(decoded.propertyData) : null
      if (pd) return pd
    } catch {
      return null
    }
  }
  return null
}

function floorFromSizings(sizings: unknown): {
  floorSizeSqft: number | null
  floorSizeM2: number | null
} {
  let floorSizeSqft: number | null = null
  let floorSizeM2: number | null = null
  if (!Array.isArray(sizings)) return { floorSizeSqft, floorSizeM2 }
  for (const item of sizings) {
    const s = asRecord(item)
    if (!s) continue
    const unit = str(s.unit)
    const size = Number(s.maximumSize ?? s.minimumSize)
    if (!size) continue
    if (unit === "sqft" && !floorSizeSqft) floorSizeSqft = Math.round(size)
    if ((unit === "sqm" || unit === "m2") && !floorSizeM2) {
      floorSizeM2 = Math.round(size * 10) / 10
    }
  }
  return { floorSizeSqft, floorSizeM2 }
}

/**
 * Map PAGE_MODEL.propertyData onto the collect shape. Image / floorplan
 * arrays are ignored on purpose (photos-off default).
 */
export function collectFromPageModel(
  pageModel: unknown,
  encodedPageModel: unknown,
  href: string,
): CollectedRightmovePage | null {
  const pd = pickPropertyData(pageModel, encodedPageModel)
  if (!pd) return null

  const prices = asRecord(pd.prices) ?? {}
  const address = asRecord(pd.address) ?? {}
  const tenure = asRecord(pd.tenure) ?? {}
  const text = asRecord(pd.text) ?? {}
  const livingCosts = asRecord(pd.livingCosts) ?? {}
  const customer = asRecord(pd.customer) ?? {}
  const contactInfo = asRecord(pd.contactInfo) ?? {}
  const phones = asRecord(contactInfo.telephoneNumbers) ?? {}
  const listingHistory = asRecord(pd.listingHistory) ?? {}
  const floors = floorFromSizings(pd.sizings)

  const keyFeatures = Array.isArray(pd.keyFeatures)
    ? pd.keyFeatures.map((f) => String(f)).filter(Boolean)
    : []

  const out = emptyCollectedPage(href)
  out.fromPageModel = true
  out.priceText = str(prices.primaryPrice)
  out.displayPriceQualifier = str(prices.displayPriceQualifier)
  out.address = str(address.displayAddress)
  out.outcode = str(address.outcode)
  out.incode = str(address.incode)
  out.bedrooms = numOrNull(pd.bedrooms)
  out.bathrooms = numOrNull(pd.bathrooms)
  out.propertySubType = str(pd.propertySubType)
  out.tenureType = str(tenure.tenureType)
  out.leaseYears = numOrNull(tenure.yearsRemainingOnLease)
  out.floorSizeSqft = floors.floorSizeSqft
  out.floorSizeM2 = floors.floorSizeM2
  out.description = str(text.description)
  out.keyFeatures = keyFeatures
  out.councilTaxBand = str(livingCosts.councilTaxBand)
  out.agentName = str(customer.branchDisplayName || customer.companyName)
  out.agentPhone = str(phones.localNumber)
  out.listingUpdateReason = str(listingHistory.listingUpdateReason)
  return out
}

export interface DomTextFallbacks {
  priceText?: string
  address?: string
  description?: string
  keyFeatures?: string[]
  agentName?: string
  statusText?: string
  pageTextSample?: string
}

export function applyDomFallbacks(
  base: CollectedRightmovePage,
  dom: DomTextFallbacks,
): CollectedRightmovePage {
  const out = { ...base, keyFeatures: [...base.keyFeatures] }
  if (!out.priceText && dom.priceText) out.priceText = dom.priceText
  if (!out.address && dom.address) out.address = dom.address
  if (!out.description && dom.description) out.description = dom.description
  if (out.keyFeatures.length === 0 && dom.keyFeatures?.length) {
    out.keyFeatures = dom.keyFeatures
  }
  if (!out.agentName && dom.agentName) out.agentName = dom.agentName
  if (dom.statusText) out.statusText = dom.statusText
  if (dom.pageTextSample) out.pageTextSample = dom.pageTextSample.slice(0, 5000)
  return out
}
