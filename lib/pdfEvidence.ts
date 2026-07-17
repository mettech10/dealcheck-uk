/**
 * Deal Package PDF — live market evidence lifted from the results page.
 *
 * The PDF used to read comparables and Article 4 only from the Flask
 * `backendData` payload, which is usually empty — the results page fetches
 * that evidence client-side (PropertyData sold route, Bright Data rental /
 * Rightmove-sold scrapers, Supabase Article 4 checker) after render. These
 * types carry exactly what the page displayed into POST /api/generate-pdf,
 * so the report always matches the on-screen numbers (a hard rule for the
 * Deal Packaging Engine).
 *
 * Every field is optional: sources resolve independently and the PDF
 * falls back to `backendData` per-section when a field is absent.
 */

export interface PdfSoldComp {
  address: string
  price: number
  date?: string
  propertyType?: string
  tenure?: string
  /** Display source, e.g. "Rightmove sold" or "Land Registry". */
  source?: string
}

export interface PdfRentalComp {
  address: string
  monthlyRent: number
  bedrooms?: number | null
  propertyType?: string
}

export interface PdfArvComp {
  address: string
  price: number
  dateSold?: string
  propertyType?: string
  bedrooms?: number | null
  source: "rightmove_sold" | "land_registry"
}

export interface PdfArticle4 {
  status: "active" | "proposed" | "none" | "unknown"
  summary?: string
  councils?: string[]
}

export interface DealPdfEvidence {
  /** Land Registry / PropertyData sold sales (Market Comparables sold tab). */
  soldComps?: PdfSoldComp[]
  soldAverage?: number | null
  /** Live rental listings (Market Comparables rental tab). */
  rentalComps?: PdfRentalComp[]
  rentalSummary?: {
    averageRent: number
    minRent: number
    maxRent: number
    count: number
  } | null
  /** ARV comparable sales (Rightmove-primary GDV/ARV evidence). */
  arvComps?: PdfArvComp[]
  arvSummary?: {
    avgPrice: number | null
    count: number
    low?: number
    high?: number
  } | null
  /** Live Article 4 check (Supabase article4_areas). */
  article4?: PdfArticle4 | null
}
