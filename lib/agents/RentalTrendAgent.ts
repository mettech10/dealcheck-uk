/**
 * RentalTrendAgent (Section 4) — learns how HMO room rents move over time.
 *
 * Monthly, for the districts we care about, it asks the backend for current
 * SpareRoom/PropertyData room comparables, stores a dated snapshot in
 * rental_trend_history, and compares against the reading from ~3 months ago.
 * A meaningful move records a 'rising_hmo_rents' / 'falling_hmo_rents' pattern
 * so the intelligence layer knows which areas are heating up or cooling.
 *
 * Codebase-specific adaptations:
 *  - The SpareRoom scraper lives in the Flask backend, so the agent calls
 *    POST {BACKEND_API_URL}/api/comparables rather than scraping directly.
 *  - That endpoint runs a live scrape (slow) and is rate-limited to 10/min, so
 *    the agent keeps a >6.5s gap between calls and stops starting new work once
 *    it nears the serverless time budget — picking the STALEST districts first
 *    so successive monthly runs cover everything.
 */
import { BaseAgent, type AgentResult } from "./BaseAgent"
import { PRIORITY_DISTRICTS } from "./constants"

const USER_AGENT = "Metalyzi Property Intelligence Bot 1.0 (+https://metalyzi.co.uk)"
const REQUEST_TIMEOUT_MS = 40_000 // a live scrape can be slow
const MIN_GAP_MS = 6_500 // stay under the backend's 10/min limit
const TIME_BUDGET_MS = 240_000 // leave headroom under the route's maxDuration
const TREND_THRESHOLD = 3 // % move (over ~3mo) worth recording as a pattern
const COMPARE_MIN_AGE_DAYS = 75 // a prior reading must be at least this old

type Loose = Record<string, unknown>

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export class RentalTrendAgent extends BaseAgent {
  constructor() {
    super("RentalTrendAgent", "0 4 1 * *") // 4am on the 1st of each month
  }

  async execute(): Promise<AgentResult> {
    const insights: string[] = []
    let processed = 0

    const backend = process.env.BACKEND_API_URL
    if (!backend) {
      return { itemsProcessed: 0, insights: ["BACKEND_API_URL not configured — rental scan skipped"] }
    }

    // Districts to monitor: everywhere we have intelligence, plus the priority list.
    const { data: rows } = await this.supabase.from("area_intelligence").select("postcode_district")
    const fromDb = ((rows as Loose[]) ?? [])
      .map((r) => String(r.postcode_district ?? "").toUpperCase())
      .filter(Boolean)
    const allDistricts = [...new Set([...fromDb, ...PRIORITY_DISTRICTS])]

    // Order stalest-first so a time-limited run still makes progress everywhere.
    const lastSeen = await this.lastReadingByDistrict()
    allDistricts.sort((a, b) => (lastSeen[a] ?? "").localeCompare(lastSeen[b] ?? ""))

    const today = new Date()
    const dataDate = isoDate(today)
    const compareCutoff = isoDate(new Date(today.getTime() - COMPARE_MIN_AGE_DAYS * 86_400_000))

    const runStart = Date.now()
    let lastCallStart = 0
    let deferred = 0

    for (const district of allDistricts) {
      if (Date.now() - runStart > TIME_BUDGET_MS) {
        deferred = allDistricts.length - processed
        break
      }
      try {
        // Keep calls spaced for the backend's rate limit.
        const since = Date.now() - lastCallStart
        if (lastCallStart && since < MIN_GAP_MS) await this.sleep(MIN_GAP_MS - since)
        lastCallStart = Date.now()

        const comps = await this.fetchComparables(backend, district)
        if (!comps) continue

        const summary = (comps.summary as Loose) ?? {}
        const avgRoomRent = num(summary.averageRent)
        const listingCount = num(summary.count) ?? (Array.isArray(comps.listings) ? comps.listings.length : 0)
        const source = typeof comps.source === "string" ? comps.source : null

        // Nothing usable scraped (manual-link fallback) — skip storing.
        if (avgRoomRent === null || avgRoomRent <= 0) continue

        await this.supabase.from("rental_trend_history").upsert(
          {
            postcode_district: district,
            data_date: dataDate,
            avg_room_rent: Math.round(avgRoomRent),
            avg_monthly_rent: null, // SpareRoom comps are per-room; no whole-property figure here
            listing_count: listingCount,
            data_type: "hmo_room",
            source,
          },
          { onConflict: "postcode_district,data_date,data_type" },
        )
        processed++

        // Compare against a reading from ~3 months ago.
        const prior = await this.priorReading(district, compareCutoff)
        if (prior !== null && prior > 0) {
          const pct = ((avgRoomRent - prior) / prior) * 100
          if (Math.abs(pct) >= TREND_THRESHOLD) {
            const rising = pct > 0
            const move = `${Math.abs(pct).toFixed(1)}%`
            insights.push(
              `${district}: HMO room rents ${rising ? "↑" : "↓"} ${move} over ~3 months ` +
                `(£${Math.round(prior)} → £${Math.round(avgRoomRent)} pcm)`,
            )
            await this.recordPattern({
              pattern_type: rising ? "rising_hmo_rents" : "falling_hmo_rents",
              strategy: "hmo",
              postcode_area: district,
              description:
                `HMO room rents in ${district} ${rising ? "rose" : "fell"} ${move} over ~3 months ` +
                `(£${Math.round(prior)} → £${Math.round(avgRoomRent)} pcm).`,
              insight: rising
                ? "Strengthening room rents improve HMO cashflow and signal rising tenant demand."
                : "Softening room rents may pressure HMO cashflow — re-check rent assumptions.",
              recommendation: rising
                ? "Revisit HMO rent assumptions upward for this area."
                : "Apply more conservative HMO rent assumptions for this area.",
              confidence: Math.min(0.9, 0.5 + Math.abs(pct) / 100),
            })
          }
        }
      } catch (err) {
        console.warn(`[RentalTrendAgent] ${district}:`, err instanceof Error ? err.message : err)
      }
    }

    if (deferred > 0) {
      insights.push(`Time budget reached — ${deferred} district(s) deferred to the next run.`)
    }

    return { itemsProcessed: processed, insights }
  }

  /** Latest data_date per district (for stalest-first ordering). */
  private async lastReadingByDistrict(): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    try {
      const { data } = await this.supabase
        .from("rental_trend_history")
        .select("postcode_district, data_date")
        .eq("data_type", "hmo_room")
        .order("data_date", { ascending: false })
      for (const r of (data as Loose[]) ?? []) {
        const d = String(r.postcode_district ?? "").toUpperCase()
        const dt = String(r.data_date ?? "")
        if (d && !out[d]) out[d] = dt // first seen = most recent (desc order)
      }
    } catch {
      /* no history yet — everything is equally stale */
    }
    return out
  }

  /** avg_room_rent from the most recent reading at least COMPARE_MIN_AGE_DAYS old. */
  private async priorReading(district: string, cutoff: string): Promise<number | null> {
    const { data } = await this.supabase
      .from("rental_trend_history")
      .select("avg_room_rent")
      .eq("postcode_district", district)
      .eq("data_type", "hmo_room")
      .lte("data_date", cutoff)
      .order("data_date", { ascending: false })
      .limit(1)
      .maybeSingle()
    return data ? num((data as Loose).avg_room_rent) : null
  }

  /** Ask the backend for current room comparables for a district. */
  private async fetchComparables(backend: string, district: string): Promise<Loose | null> {
    try {
      const res = await fetch(`${backend.replace(/\/$/, "")}/api/comparables`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": USER_AGENT },
        body: JSON.stringify({ postcode: district, maxResults: 15 }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!res.ok) return null
      const json = (await res.json()) as Loose
      return json && json.success ? json : null
    } catch {
      return null
    }
  }
}
