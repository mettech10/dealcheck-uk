/**
 * Area rent estimate for the Deal Screener popup.
 *
 * Competing extensions pre-fill rent; the screener used to make users type
 * it. This estimates from open data instead of scraping the listing:
 *   1. postcode_benchmarks — VOA private rental market statistics by postcode
 *      district and bedrooms (median + quartiles). Free, 369 districts.
 *   2. PropertyData rents — district fallback, Supabase-cached for 7 days.
 * The estimate is a district median, labelled as such, and always editable.
 */

export interface RentEstimate {
  /** Median monthly rent (£). */
  monthlyRent: number
  /** Lower / upper quartile (£/month) when the source has them. */
  low: number | null
  high: number | null
  district: string
  bedroomsRequested: number | null
  /** Bedroom band actually used; null means all property sizes. */
  bedroomsUsed: number | null
  source: "voa-prms" | "propertydata"
  dataMonth: string | null
  /** Plain-English description of what the number is. */
  basis: string
}

export interface BenchmarkRentRow {
  bedrooms: number | null
  median_monthly_rent: number | string | null
  lower_quartile_rent: number | string | null
  upper_quartile_rent: number | string | null
  data_month: string | null
}

export interface RentEstimateDeps {
  /** postcode_benchmarks rows for the district with property_type "all". */
  benchmarkRows: (district: string) => Promise<BenchmarkRentRow[]>
  /** PropertyData long-let average for the district (£/month), or null. */
  propertyDataMonthly?: (district: string, bedrooms: number | null) => Promise<number | null>
}

/** VOA publishes bands up to 4 bedrooms ("4+"). */
const MAX_BAND = 4

const OUTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)(?:\s*\d[A-Z]{2})?$/

export function outcodeFrom(postcodeOrOutcode: string | null | undefined): string | null {
  const text = (postcodeOrOutcode ?? "").toUpperCase().replace(/\s+/g, " ").trim()
  const match = OUTCODE.exec(text)
  return match ? match[1] : null
}

function positive(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function bedsLabel(beds: number | null, requested: number | null): string {
  if (beds == null) return "all property sizes"
  if (beds === 0) return "studios"
  const label = `${beds}-bed`
  return requested != null && requested > MAX_BAND ? `${label}+ homes` : `${label} homes`
}

export async function estimateRent(
  input: { postcode: string; bedrooms: number | null },
  deps: RentEstimateDeps,
): Promise<RentEstimate | null> {
  const district = outcodeFrom(input.postcode)
  if (!district) return null
  const requested =
    input.bedrooms != null && Number.isFinite(input.bedrooms) && input.bedrooms >= 0
      ? Math.floor(input.bedrooms)
      : null
  const band = requested == null ? null : Math.min(requested, MAX_BAND)

  const rows = await deps.benchmarkRows(district).catch(() => [] as BenchmarkRentRow[])
  const newestFirst = [...rows].sort((a, b) => (b.data_month ?? "").localeCompare(a.data_month ?? ""))
  const exact = band == null ? undefined : newestFirst.find((r) => r.bedrooms === band && positive(r.median_monthly_rent))
  const allSizes = newestFirst.find((r) => r.bedrooms == null && positive(r.median_monthly_rent))
  const row = exact ?? allSizes
  if (row) {
    const used = exact ? band : null
    const month = row.data_month ?? null
    return {
      monthlyRent: positive(row.median_monthly_rent)!,
      low: positive(row.lower_quartile_rent),
      high: positive(row.upper_quartile_rent),
      district,
      bedroomsRequested: requested,
      bedroomsUsed: used,
      source: "voa-prms",
      dataMonth: month,
      basis: `Median rent for ${bedsLabel(used, requested)} in ${district} (VOA${month ? `, ${month}` : ""})`,
    }
  }

  if (deps.propertyDataMonthly) {
    const monthly = positive(await deps.propertyDataMonthly(district, band).catch(() => null))
    if (monthly) {
      return {
        monthlyRent: monthly,
        low: null,
        high: null,
        district,
        bedroomsRequested: requested,
        bedroomsUsed: band,
        source: "propertydata",
        dataMonth: null,
        basis: `Average asking rent for ${bedsLabel(band, requested)} in ${district} (PropertyData)`,
      }
    }
  }
  return null
}
