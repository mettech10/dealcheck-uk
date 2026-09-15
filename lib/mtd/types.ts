export type MtdCategoryKind =
  | "income"
  | "expense"
  | "residential_finance"
  | "adjustment"
  | "income_adjustment"

export interface Sa105Category {
  code: string
  name: string
  kind: MtdCategoryKind
  sa105Box: string | null
  hmrcField: string | null
  isResidentialFinance: boolean
  aliases: string[]
}

export interface PortfolioProperty {
  id: string
  nickname: string | null
  address: string
  postcode: string | null
  strategy: string | null
  status: string | null
}

export interface FlaskBusiness {
  id: string
  orgId: string
  name: string
  taxYearStart: string
  basis: "standard" | "calendar"
  country: string
  status: string
}

export interface FlaskMtdProperty {
  id: string
  orgId: string
  businessId: string
  /** Metalyzi portfolio property UUID (platform SoT). */
  propertyId: string | null
  label: string
  address: string | null
  postcode: string | null
  occupancyType: string
}

export interface FlaskLedgerEntry {
  id: string
  orgId: string
  businessId: string
  propertyId: string | null
  entryDate: string
  amountPence: number
  categoryCode: string
  description: string | null
  counterparty: string | null
  source: "manual" | "csv"
}

export interface FlaskQuarterPack {
  id: string
  orgId: string
  businessId: string
  taxYear: string
  quarter: number
  basis: string
  periodStart: string
  periodEnd: string
  immutable: true
  hmrcSubmit: false
  disclaimer: string
  snapshot?: FlaskPackSnapshot
}

export interface FlaskPackSnapshot {
  schemaVersion: number
  packType: string
  disclaimer: string
  hmrcSubmit: false
  taxYear?: string
  quarter?: number
  basis?: string
  periodStart?: string
  periodEnd?: string
  periodNetPence?: number
  entryCount?: number
  periodTotalsPence?: Record<string, number>
  yearToDateTotalsPence?: Record<string, number>
  residentialFinance?: {
    excludedFromProfitDeduction?: boolean
    note?: string
    period?: {
      periodPence?: number
      broughtForwardPence?: number
      totalPence?: number
      nonResidentialFinancePence?: number
    }
    yearToDate?: {
      periodPence?: number
      broughtForwardPence?: number
      totalPence?: number
      nonResidentialFinancePence?: number
    }
  }
  entries?: Array<{
    id: string
    date: string
    propertyId: string | null
    categoryCode: string
    amountPence: number
    description?: string | null
    isResidentialFinance?: boolean
  }>
  business?: { id: string; name: string; orgId?: string }
  properties?: Array<{
    id: string
    propertyId: string | null
    label: string
    address?: string | null
  }>
}

export interface FlaskShareLink {
  id: string
  token: string
  urlPath: string
  expiresAt: string
  packId: string
}

export interface FlaskCsvPreview {
  readyToCommit: boolean
  validCount: number
  invalidCount: number
  rowCount: number
  rows: Array<{
    rowNumber: number
    valid: boolean
    errors: string[]
    mapped: {
      date?: string
      categoryCode?: string
      propertyId?: string | null
      amountPence?: number
      description?: string | null
    }
  }>
}

/** UI quarter selector. Flask packs are Q1–Q4 only (`year` is display, not an API value). */
export type MtdQuarterId = 1 | 2 | 3 | 4 | "year"

/** @deprecated use Sa105Category.code */
export type MtdCategoryId = string

export interface StoredShareLink {
  id: string
  token: string
  url: string
  expiresAt: string
  packId: string
  taxYear?: string
  quarter?: number
  createdAt: string
}
