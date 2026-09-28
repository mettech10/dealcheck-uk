import { describe, expect, test, vi } from "vitest"
import { estimateRent, outcodeFrom, type BenchmarkRentRow } from "@/lib/deal-screener/rentEstimate"

const M14: BenchmarkRentRow[] = [
  { bedrooms: null, median_monthly_rent: "950.00", lower_quartile_rent: "807.50", upper_quartile_rent: "1092.50", data_month: "2026-04" },
  { bedrooms: 2, median_monthly_rent: "1000.00", lower_quartile_rent: "850.00", upper_quartile_rent: "1150.00", data_month: "2026-04" },
  { bedrooms: 3, median_monthly_rent: "1200.00", lower_quartile_rent: "1020.00", upper_quartile_rent: "1380.00", data_month: "2026-04" },
  { bedrooms: 3, median_monthly_rent: "1100.00", lower_quartile_rent: "900.00", upper_quartile_rent: "1300.00", data_month: "2025-04" },
  { bedrooms: 4, median_monthly_rent: "1500.00", lower_quartile_rent: "1275.00", upper_quartile_rent: "1725.00", data_month: "2026-04" },
]

const rows = (data: BenchmarkRentRow[]) => ({ benchmarkRows: async () => data })

describe("outcodeFrom", () => {
  test.each([
    ["M14 6LT", "M14"],
    ["m14 6lt", "M14"],
    ["M14", "M14"],
    ["SW1A 1AA", "SW1A"],
    ["BL4 8LQ", "BL4"],
    ["", null],
    ["not a postcode", null],
  ])("%s → %s", (input, expected) => {
    expect(outcodeFrom(input)).toBe(expected)
  })
})

describe("estimateRent", () => {
  test("uses the newest VOA median for the bedroom band", async () => {
    const e = await estimateRent({ postcode: "M14 6LT", bedrooms: 3 }, rows(M14))
    expect(e).toMatchObject({
      monthlyRent: 1200,
      low: 1020,
      high: 1380,
      district: "M14",
      bedroomsUsed: 3,
      source: "voa-prms",
      dataMonth: "2026-04",
    })
    expect(e?.basis).toBe("Median rent for 3-bed homes in M14 (VOA, 2026-04)")
  })

  test("5+ bedrooms use the 4+ band and say so", async () => {
    const e = await estimateRent({ postcode: "M14", bedrooms: 6 }, rows(M14))
    expect(e?.monthlyRent).toBe(1500)
    expect(e?.bedroomsUsed).toBe(4)
    expect(e?.basis).toContain("4-bed+ homes")
  })

  test("unknown bedrooms fall back to the all-sizes median", async () => {
    const e = await estimateRent({ postcode: "M14 6LT", bedrooms: null }, rows(M14))
    expect(e?.monthlyRent).toBe(950)
    expect(e?.bedroomsUsed).toBeNull()
    expect(e?.basis).toContain("all property sizes")
  })

  test("falls back to PropertyData when VOA has no district", async () => {
    const propertyDataMonthly = vi.fn(async () => 1175)
    const e = await estimateRent(
      { postcode: "CR0 1NX", bedrooms: 2 },
      { benchmarkRows: async () => [], propertyDataMonthly },
    )
    expect(propertyDataMonthly).toHaveBeenCalledWith("CR0", 2)
    expect(e).toMatchObject({ monthlyRent: 1175, source: "propertydata", low: null, high: null })
  })

  test("no data and a bad postcode both return null (never a national guess)", async () => {
    expect(await estimateRent({ postcode: "CR0 1NX", bedrooms: 2 }, { benchmarkRows: async () => [] })).toBeNull()
    expect(await estimateRent({ postcode: "nope", bedrooms: 2 }, rows(M14))).toBeNull()
  })

  test("a failing source degrades to the next one", async () => {
    const e = await estimateRent(
      { postcode: "BL4 8LQ", bedrooms: 3 },
      {
        benchmarkRows: async () => {
          throw new Error("supabase down")
        },
        propertyDataMonthly: async () => 700,
      },
    )
    expect(e?.monthlyRent).toBe(700)
  })
})
