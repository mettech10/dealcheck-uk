import type { MtdQuarterId } from "./types"

export interface TaxYearPeriod {
  /** Label like "2025-26" */
  taxYear: string
  /** Calendar year in which the tax year starts (6 April). */
  startYear: number
  start: Date
  end: Date
}

export interface QuarterPeriod {
  taxYear: string
  quarter: MtdQuarterId
  label: string
  start: Date
  end: Date
}

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day))
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

export function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const d = utcDate(year, month - 1, day)
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null
  }
  return d
}

/** UK tax year containing `date` (UTC calendar date). */
export function taxYearFromDate(date: Date): TaxYearPeriod {
  const y = date.getUTCFullYear()
  const startThis = utcDate(y, 3, 6) // 6 April
  const startYear = date >= startThis ? y : y - 1
  return taxYearFromStartYear(startYear)
}

export function taxYearFromStartYear(startYear: number): TaxYearPeriod {
  const yy = String(startYear + 1).slice(-2)
  return {
    taxYear: `${startYear}-${yy}`,
    startYear,
    start: utcDate(startYear, 3, 6),
    end: utcDate(startYear + 1, 3, 5),
  }
}

export function parseTaxYear(label: string): TaxYearPeriod | null {
  const m = /^(\d{4})-(\d{2})$/.exec(label.trim())
  if (!m) return null
  const startYear = Number(m[1])
  const yy = Number(m[2])
  if ((startYear + 1) % 100 !== yy) return null
  return taxYearFromStartYear(startYear)
}

export function currentTaxYear(now = new Date()): TaxYearPeriod {
  return taxYearFromDate(now)
}

/**
 * MTD ITSA quarterly periods for UK property:
 *   Q1  6 Apr – 5 Jul
 *   Q2  6 Jul – 5 Oct
 *   Q3  6 Oct – 5 Jan
 *   Q4  6 Jan – 5 Apr
 */
export function quarterPeriod(taxYear: string, quarter: MtdQuarterId): QuarterPeriod | null {
  const ty = parseTaxYear(taxYear)
  if (!ty) return null
  const y = ty.startYear
  if (quarter === "year") {
    return {
      taxYear,
      quarter: "year",
      label: `Full tax year ${taxYear}`,
      start: ty.start,
      end: ty.end,
    }
  }
  const ranges: Record<1 | 2 | 3 | 4, { start: Date; end: Date; label: string }> = {
    1: {
      start: utcDate(y, 3, 6),
      end: utcDate(y, 6, 5),
      label: "Q1 (6 Apr – 5 Jul)",
    },
    2: {
      start: utcDate(y, 6, 6),
      end: utcDate(y, 9, 5),
      label: "Q2 (6 Jul – 5 Oct)",
    },
    3: {
      start: utcDate(y, 9, 6),
      end: utcDate(y + 1, 0, 5),
      label: "Q3 (6 Oct – 5 Jan)",
    },
    4: {
      start: utcDate(y + 1, 0, 6),
      end: utcDate(y + 1, 3, 5),
      label: "Q4 (6 Jan – 5 Apr)",
    },
  }
  const r = ranges[quarter]
  return { taxYear, quarter, label: r.label, start: r.start, end: r.end }
}

export function quarterFromDate(date: Date): { taxYear: string; quarter: 1 | 2 | 3 | 4 } {
  const ty = taxYearFromDate(date)
  for (const q of [1, 2, 3, 4] as const) {
    const p = quarterPeriod(ty.taxYear, q)!
    if (date >= p.start && date <= p.end) {
      return { taxYear: ty.taxYear, quarter: q }
    }
  }
  return { taxYear: ty.taxYear, quarter: 1 }
}

export function parseQuarterParam(raw: string | null | undefined): MtdQuarterId | null {
  if (raw == null || raw === "") return null
  const v = raw.trim().toLowerCase()
  if (v === "year" || v === "full" || v === "fy") return "year"
  const n = Number(v)
  if (n === 1 || n === 2 || n === 3 || n === 4) return n
  return null
}

export function recentTaxYears(now = new Date(), count = 4): TaxYearPeriod[] {
  const current = currentTaxYear(now)
  return Array.from({ length: count }, (_, i) => taxYearFromStartYear(current.startYear - i))
}

export function isDateInPeriod(isoDate: string, start: Date, end: Date): boolean {
  const d = parseIsoDate(isoDate)
  if (!d) return false
  return d >= start && d <= end
}
