/**
 * GET /api/v1/screener/rent-estimate?postcode=M14 6LT&beds=3
 *
 * District rent estimate that pre-fills the Deal Screener popup's rent box.
 * Signed-in only (extension Bearer or web cookie) because the fallback
 * spends PropertyData quota.
 */

import { getRequestUser } from "@/lib/apiAuth"
import { screenerJson, screenerOptions } from "@/lib/deal-screener/cors"
import { estimateRent, type BenchmarkRentRow } from "@/lib/deal-screener/rentEstimate"
import { cachedGetRents } from "@/lib/propertydata-cache"
import { weeklyToMonthly } from "@/lib/propertydata"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function OPTIONS(req: Request) {
  return screenerOptions(req)
}

export async function GET(req: Request) {
  const user = await getRequestUser(req)
  if (!user) return screenerJson(req, { error: "unauthorised" }, 401)

  const params = new URL(req.url).searchParams
  const postcode = params.get("postcode") ?? params.get("outcode") ?? ""
  const bedsRaw = params.get("beds")
  const bedrooms = bedsRaw != null && bedsRaw !== "" ? Number(bedsRaw) : null

  const admin = createAdminClient()
  const estimate = await estimateRent(
    { postcode, bedrooms: Number.isFinite(bedrooms) ? bedrooms : null },
    {
      benchmarkRows: async (district) => {
        const { data, error } = await admin
          .from("postcode_benchmarks")
          .select("bedrooms, median_monthly_rent, lower_quartile_rent, upper_quartile_rent, data_month")
          .eq("postcode_district", district)
          .eq("property_type", "all")
        if (error) throw error
        return (data ?? []) as BenchmarkRentRow[]
      },
      propertyDataMonthly: async (district, beds) => {
        const rents = await cachedGetRents(district, beds ?? undefined)
        const longLet = rents?.data?.long_let
        const avg = Number(longLet?.average)
        if (!Number.isFinite(avg) || avg <= 0) return null
        return (longLet?.unit ?? "").toLowerCase().includes("week") ? weeklyToMonthly(avg) : avg
      },
    },
  )

  return screenerJson(req, { estimate })
}
