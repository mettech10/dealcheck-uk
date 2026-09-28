import type { BuyerType, PropertyFormData, SDLTRateType } from "./types"

export function sdltAnalysisLink(price: number, buyerType: BuyerType, rateType: SDLTRateType): string {
  const query = new URLSearchParams({ purchasePrice: String(price), buyerType, sdltRateType: rateType })
  return `/analyse?${query}`
}

export function readSdltPrefill(query: Pick<URLSearchParams, "get">): Partial<PropertyFormData> | null {
  const price = Number(query.get("purchasePrice"))
  if (!Number.isFinite(price) || price <= 0) return null
  const buyer = query.get("buyerType")
  const rate = query.get("sdltRateType")
  return {
    purchasePrice: price,
    buyerType: buyer === "first-time" || buyer === "standard" ? buyer : "additional",
    sdltRateType: rate === "mixed-use" || rate === "non-residential" ? rate : "residential",
  }
}
