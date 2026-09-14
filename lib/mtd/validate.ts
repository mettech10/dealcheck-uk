import { isCategoryId } from "./categories"
import { parseIsoDate } from "./taxYear"
import type { MtdLedgerInput } from "./types"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function validateLedgerInput(raw: {
  propertyId?: unknown
  entryDate?: unknown
  amount?: unknown
  categoryId?: unknown
  description?: unknown
  reference?: unknown
  source?: unknown
}): { ok: true; value: MtdLedgerInput } | { ok: false; error: string } {
  const propertyId = typeof raw.propertyId === "string" ? raw.propertyId.trim() : ""
  if (!isUuid(propertyId)) {
    return { ok: false, error: "propertyId is required and must be a portfolio property UUID." }
  }

  const entryDate = typeof raw.entryDate === "string" ? raw.entryDate.trim() : ""
  if (!parseIsoDate(entryDate)) {
    return { ok: false, error: "entryDate must be a valid ISO date (YYYY-MM-DD)." }
  }

  const amount = Number(raw.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "amount must be a number greater than 0." }
  }

  const categoryId = typeof raw.categoryId === "string" ? raw.categoryId.trim() : ""
  if (!isCategoryId(categoryId)) {
    return { ok: false, error: "categoryId must be an SA105-aligned category." }
  }

  const description = typeof raw.description === "string" ? raw.description.trim() : ""
  if (!description) {
    return { ok: false, error: "description is required." }
  }
  if (description.length > 500) {
    return { ok: false, error: "description must be 500 characters or fewer." }
  }

  const reference =
    raw.reference == null || raw.reference === ""
      ? null
      : String(raw.reference).trim().slice(0, 120)

  const source = raw.source === "csv" ? "csv" : "manual"

  return {
    ok: true,
    value: {
      propertyId,
      entryDate,
      amount: Math.round(amount * 100) / 100,
      categoryId,
      description,
      reference,
      source,
    },
  }
}
