export type MtdCategoryKind = "income" | "expense" | "allowance" | "adjustment"

export interface Sa105Category {
  id: string
  label: string
  kind: MtdCategoryKind
  /** SA105 box number, e.g. "21". Null when the MTD field has no dedicated box. */
  sa105Box: string | null
  /** HMRC MTD ITSA UK-property field name (documentation mapping only). */
  hmrcField: string
  description: string
  aliases: string[]
}

export interface MtdProperty {
  propertyId: string
  nickname: string | null
  address: string
  postcode: string | null
  strategy: string | null
  status: string | null
}

export interface MtdBusiness {
  id: string
  user_id: string
  name: string
  accounting_basis: "cash" | "accruals"
  notes: string | null
  created_at: string
  updated_at: string
}

export interface MtdLedgerEntry {
  id: string
  user_id: string
  business_id: string
  /** Source of truth — portfolio_properties.id */
  property_id: string
  entry_date: string
  amount: number
  category_id: string
  description: string
  reference: string | null
  source: "manual" | "csv"
  created_at: string
  updated_at: string
}

export interface MtdLedgerInput {
  propertyId: string
  entryDate: string
  amount: number
  categoryId: string
  description: string
  reference?: string | null
  source?: "manual" | "csv"
}

export interface ParsedCsvRow {
  line: number
  entryDate: string
  amount: number
  description: string
  categoryId: string | null
  categoryHint: string | null
  propertyId: string | null
  propertyHint: string | null
  reference: string | null
  warnings: string[]
}

export interface CategoryTotals {
  categoryId: string
  label: string
  kind: MtdCategoryKind
  sa105Box: string | null
  count: number
  total: number
}

export interface PropertyPackSlice {
  propertyId: string
  label: string
  income: number
  expenses: number
  allowances: number
  adjustments: number
  netWorkingPapers: number
  entryCount: number
  byCategory: CategoryTotals[]
}

export interface MtdPack {
  taxYear: string
  quarter: MtdQuarterId
  periodStart: string
  periodEnd: string
  generatedAt: string
  hmrcSubmission: false
  downloadKind: "working_papers"
  disclaimer: string
  totals: {
    income: number
    expenses: number
    allowances: number
    adjustments: number
    netWorkingPapers: number
    entryCount: number
  }
  byCategory: CategoryTotals[]
  byProperty: PropertyPackSlice[]
  entries: MtdLedgerEntry[]
}

export type MtdQuarterId = 1 | 2 | 3 | 4 | "year"

export interface MtdShareLink {
  id: string
  token: string
  label: string | null
  expires_at: string | null
  revoked_at: string | null
  created_at: string
  last_accessed_at: string | null
  url: string
}
