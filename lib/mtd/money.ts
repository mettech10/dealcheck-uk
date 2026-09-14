export function formatGbp(pounds: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pounds)
}

export function formatGbpFromPence(pence: number): string {
  return formatGbp(pence / 100)
}

export function poundsToPence(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("amount must be a number")
    return Math.round(value * 100)
  }
  const text = value.trim().replace(/[£,\s]/g, "").replace(/gbp/i, "")
  if (!text) throw new Error("amount is required")
  const negative = text.startsWith("(") && text.endsWith(")")
  const raw = negative ? text.slice(1, -1) : text.startsWith("-") ? text.slice(1) : text
  const n = Number(raw)
  if (!Number.isFinite(n)) throw new Error("amount must be a number")
  const pence = Math.round(n * 100)
  return negative || text.startsWith("-") ? -pence : pence
}

export function requireAmountPence(value: unknown): number {
  if (typeof value === "boolean" || value == null || value === "") {
    throw new Error("amountPence is required")
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error("amountPence must be whole pence, not pounds")
    }
    return value
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim())
  }
  throw new Error("amountPence must be an integer")
}
