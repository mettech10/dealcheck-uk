import { matchCategory } from "./categories"
import { parseIsoDate, toIsoDate } from "./taxYear"
import type { ParsedCsvRow } from "./types"
import { parseAmount } from "./money"

export const CSV_TEMPLATE_HEADERS = [
  "date",
  "amount",
  "description",
  "category",
  "property_id",
  "reference",
] as const

export const CSV_TEMPLATE_BODY = `2025-04-06,850.00,April rent received,rent,,INV-001
2025-04-12,42.50,Buildings insurance,premises_running_costs,,
2025-04-18,120.00,Letting agent management fee,professional_fees,,
`

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** RFC4180-ish CSV parser. Handles quoted fields, escaped quotes, CR/LF. */
export function parseCsv(text: string): string[][] {
  const src = stripBom(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ",") {
      row.push(field)
      field = ""
      continue
    }
    if (ch === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      continue
    }
    if (ch === "\r") continue
    field += ch
  }
  if (inQuotes) {
    throw new Error("CSV has an unclosed quoted field")
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

const HEADER_ALIASES: Record<string, keyof MappedCols | "skip"> = {
  date: "date",
  txn_date: "date",
  transaction_date: "date",
  entry_date: "date",
  amount: "amount",
  value: "amount",
  gbp: "amount",
  net: "amount",
  description: "description",
  narrative: "description",
  details: "description",
  memo: "description",
  category: "category",
  sa105: "category",
  box: "category",
  type: "category",
  property_id: "propertyId",
  propertyid: "propertyId",
  property: "propertyHint",
  address: "propertyHint",
  nickname: "propertyHint",
  reference: "reference",
  ref: "reference",
  invoice: "reference",
}

interface MappedCols {
  date: number
  amount: number
  description: number
  category: number | null
  propertyId: number | null
  propertyHint: number | null
  reference: number | null
}

function mapHeaders(headers: string[]): MappedCols {
  const idx: Partial<MappedCols> = {}
  headers.forEach((h, i) => {
    const key = HEADER_ALIASES[normHeader(h)]
    if (!key || key === "skip") return
    if (idx[key] == null) idx[key] = i as never
  })
  if (idx.date == null || idx.amount == null || idx.description == null) {
    throw new Error(
      "CSV must include date, amount, and description columns (category and property_id recommended).",
    )
  }
  return {
    date: idx.date,
    amount: idx.amount,
    description: idx.description,
    category: idx.category ?? null,
    propertyId: idx.propertyId ?? null,
    propertyHint: idx.propertyHint ?? null,
    reference: idx.reference ?? null,
  }
}

function parseFlexibleDate(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const iso = parseIsoDate(trimmed)
  if (iso) return toIsoDate(iso)
  const uk = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(trimmed)
  if (uk) {
    const day = Number(uk[1])
    const month = Number(uk[2])
    let year = Number(uk[3])
    if (year < 100) year += year >= 70 ? 1900 : 2000
    const d = parseIsoDate(
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    )
    return d ? toIsoDate(d) : null
  }
  return null
}

export function parseLedgerCsv(text: string): ParsedCsvRow[] {
  const table = parseCsv(text)
  if (table.length < 2) {
    throw new Error("CSV is empty — include a header row and at least one entry.")
  }
  const cols = mapHeaders(table[0])
  const out: ParsedCsvRow[] = []

  table.slice(1).forEach((cells, i) => {
    const line = i + 2
    const warnings: string[] = []
    const dateRaw = cells[cols.date] ?? ""
    const amountRaw = cells[cols.amount] ?? ""
    const description = (cells[cols.description] ?? "").trim()
    const categoryHint =
      cols.category != null ? (cells[cols.category] ?? "").trim() || null : null
    const propertyIdRaw =
      cols.propertyId != null ? (cells[cols.propertyId] ?? "").trim() || null : null
    const propertyHint =
      cols.propertyHint != null ? (cells[cols.propertyHint] ?? "").trim() || null : null
    const reference =
      cols.reference != null ? (cells[cols.reference] ?? "").trim() || null : null

    const entryDate = parseFlexibleDate(dateRaw)
    const amount = parseAmount(amountRaw)

    if (!entryDate) warnings.push("Unrecognised date (use YYYY-MM-DD or DD/MM/YYYY).")
    if (amount == null) warnings.push("Unrecognised amount.")
    if (!description) warnings.push("Description is blank.")

    const signed = amount ?? 0
    const abs = Math.abs(signed)
    let categoryId = matchCategory(categoryHint)
    if (!categoryId) categoryId = matchCategory(description)
    if (!categoryId && signed < 0) {
      // Negative amount with no category: treat as unmatched expense, not auto-filed.
      warnings.push("Negative amount — pick an expense category before importing.")
    }
    if (!categoryId) warnings.push("Could not match an SA105 category — pick one before importing.")

    out.push({
      line,
      entryDate: entryDate ?? "",
      amount: abs,
      description,
      categoryId,
      categoryHint,
      propertyId: propertyIdRaw,
      propertyHint,
      reference,
      warnings,
    })
  })

  return out
}

export function csvTemplate(): string {
  return `${CSV_TEMPLATE_HEADERS.join(",")}\n${CSV_TEMPLATE_BODY}`
}
