/**
 * MarketPriceAgent (Section 2) — learns market prices automatically.
 *
 * Monthly, for every district we have intelligence on (plus a priority list),
 * it reads the area sold-price average from PropertyData (the same source the
 * platform uses for sold comparables) and records it as a platform benchmark.
 * Price growth is computed against the agent's own previous reading, so the
 * platform builds its own market time-series over time.
 *
 * Adaptation from the spec: the existing Land Registry endpoints query an
 * EXACT full postcode, so they can't aggregate a district — PropertyData is
 * the district-level source. And the agent writes only to platform_benchmarks
 * (market_median_price_* / market_price_growth_*) rather than overwriting
 * area_intelligence.median_purchase_price, which the user pipeline owns as a
 * running mean (avoids two writers fighting over one column).
 */
import { BaseAgent, type AgentResult } from "./BaseAgent"
import { PRIORITY_DISTRICTS } from "./constants"
import { cachedGetSoldPrices } from "@/lib/propertydata-cache"

type Loose = Record<string, unknown>

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

export class MarketPriceAgent extends BaseAgent {
  constructor() {
    super("MarketPriceAgent", "0 3 1 * *") // 3am on the 1st of each month
  }

  async execute(): Promise<AgentResult> {
    const insights: string[] = []
    let processed = 0

    const { data: rows } = await this.supabase.from("area_intelligence").select("postcode_district")
    const fromDb = ((rows as Loose[]) ?? [])
      .map((r) => String(r.postcode_district ?? "").toUpperCase())
      .filter(Boolean)
    const allDistricts = [...new Set([...fromDb, ...PRIORITY_DISTRICTS])]

    for (const district of allDistricts) {
      try {
        const sold = await cachedGetSoldPrices(district)
        if (!sold || sold.status !== "success" || !sold.data) {
          continue
        }
        const data = sold.data as Loose
        const avg = num(data.average)
        if (avg === null || avg <= 0) continue
        const sales = Array.isArray(data.raw_data) ? data.raw_data.length : null

        const medianMetric = `market_median_price_${district}`

        // Previous reading from the agent's own benchmark series.
        const { data: prev } = await this.supabase
          .from("platform_benchmarks")
          .select("metric_value")
          .eq("metric_name", medianMetric)
          .maybeSingle()
        const prevMedian = prev ? num((prev as Loose).metric_value) : null

        // Record the current market median.
        await this.supabase.from("platform_benchmarks").upsert(
          {
            metric_name: medianMetric,
            metric_value: Math.round(avg),
            metric_type: "price",
            sample_size: sales ?? undefined,
            last_calculated: new Date().toISOString(),
          },
          { onConflict: "metric_name" },
        )

        // Growth vs the previous reading.
        if (prevMedian !== null && prevMedian > 0) {
          const growth = ((avg - prevMedian) / prevMedian) * 100
          await this.supabase.from("platform_benchmarks").upsert(
            {
              metric_name: `market_price_growth_${district}`,
              metric_value: Number(growth.toFixed(2)),
              metric_type: "price_growth",
              sample_size: sales ?? undefined,
              last_calculated: new Date().toISOString(),
            },
            { onConflict: "metric_name" },
          )
          if (Math.abs(growth) > 5) {
            insights.push(
              `${district}: ${growth > 0 ? "↑" : "↓"} ${Math.abs(growth).toFixed(1)}% median price change since last reading ` +
                `(£${Math.round(prevMedian).toLocaleString()} → £${Math.round(avg).toLocaleString()})`,
            )
          }
        }

        processed++
        await this.sleep(2000) // polite spacing between PropertyData calls
      } catch (err) {
        console.warn(`[MarketPriceAgent] ${district}:`, err instanceof Error ? err.message : err)
      }
    }

    return { itemsProcessed: processed, insights }
  }
}
