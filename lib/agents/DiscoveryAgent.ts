/**
 * DiscoveryAgent — the two-tier discovery pipeline, run as a backend job.
 *
 * Flow per search:
 *   1. scrapeRightmoveSearch() once per postcode area (3s apart)
 *   2. Tier 1 screen EVERY listing found — cached area data only, no live
 *      calls and no AI per listing
 *   3. Persist Tier 1 signals for ALL listings (failures included, so
 *      thresholds can be tuned against real data)
 *   4. Tier 2 deep analysis on the top TIER2_CAP survivors only (2s apart)
 *   5. Email the user if anything strong was found
 *
 * Extends BaseAgent so runs land in agent_run_log alongside the
 * self-learning agents, and execute() lets the daily dispatcher pick up
 * recurring searches.
 */
import { BaseAgent, type AgentResult } from "./BaseAgent"
import { scrapeRightmoveSearch } from "@/lib/scrapers/rightmove-search-scraper"
import {
  screenListing,
  type ListingCandidate,
  type Tier1Result,
} from "@/lib/discovery/tier1Screen"
import { runDeepAnalysis } from "@/lib/discovery/tier2Analyse"
import { resetDistrictIntelCache } from "@/lib/discovery/areaIntel"
import { sendBrevoEmail, baseTemplate } from "@/lib/brevo-email"

/** Hard cap on Tier 2 analyses per run — non-negotiable cost control. */
export const TIER2_CAP = 15
/** Listings requested per postcode area (Rightmove serves ~24/page). */
const PER_AREA_LIMIT = 25
const AREA_DELAY_MS = 3000
const DEEP_DELAY_MS = 2000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface SearchRow {
  id: string
  user_id: string | null
  search_name: string | null
  postcode_areas: string[] | null
  strategies: string[] | null
  min_price: number | null
  max_price: number | null
  min_bedrooms: number | null
  max_bedrooms: number | null
  is_recurring: boolean | null
  frequency: string | null
  last_run_at: string | null
}

export class DiscoveryAgent extends BaseAgent {
  constructor() {
    // Recurring searches are picked up by the daily dispatcher; ad-hoc runs
    // come in via the API, so the cadence here is "daily or finer".
    super("DiscoveryAgent", "0 7 * * *")
  }

  /** Run one saved search end to end. */
  async runSearch(searchId: string): Promise<AgentResult> {
    const insights: string[] = []
    // Area data is memoised per run — clear so a re-run can't serve stale
    // medians from a previous execution.
    resetDistrictIntelCache()

    const { data: searchData, error } = await this.supabase
      .from("discovery_searches")
      .select("*")
      .eq("id", searchId)
      .single()

    if (error || !searchData) {
      return { itemsProcessed: 0, insights: ["Search not found"], error: "not_found" }
    }
    const search = searchData as unknown as SearchRow

    const areas = (search.postcode_areas ?? []).filter(Boolean)
    const strategies = (search.strategies ?? []).filter(Boolean)
    if (!areas.length || !strategies.length) {
      return {
        itemsProcessed: 0,
        insights: ["Search has no postcode areas or strategies"],
      }
    }

    // ── STEP 1: scrape listings per area ────────────────────────────────
    const found: ListingCandidate[] = []
    const seenUrls = new Set<string>()

    for (let i = 0; i < areas.length; i++) {
      const area = areas[i]
      try {
        const rows = await scrapeRightmoveSearch({
          postcode: area,
          minPrice: search.min_price ?? undefined,
          maxPrice: search.max_price ?? undefined,
          minBedrooms: search.min_bedrooms ?? undefined,
          maxBedrooms: search.max_bedrooms ?? undefined,
          maxResults: PER_AREA_LIMIT,
          sortType: "newest",
        })
        for (const r of rows) {
          if (!r.listingUrl || seenUrls.has(r.listingUrl)) continue
          seenUrls.add(r.listingUrl)
          found.push({
            listingUrl: r.listingUrl,
            listingId: r.listingId,
            address: r.address,
            // Search cards often carry only an outcode — fall back to the
            // requested area so district lookups still resolve.
            postcode: r.postcode || area,
            price: r.price,
            bedrooms: r.bedrooms,
            propertyType: r.propertyType,
            thumbnailUrl: r.thumbnailUrl,
            description: r.description,
          })
        }
        console.log(`[Discovery] ${area}: ${rows.length} listings`)
      } catch (err) {
        console.warn(`[Discovery] scrape failed for ${area}:`, err)
        insights.push(`Could not scan ${area}`)
      }
      if (i < areas.length - 1) await sleep(AREA_DELAY_MS)
    }

    const totalFound = found.length
    if (totalFound === 0) {
      await this.touchLastRun(searchId)
      return {
        itemsProcessed: 0,
        insights: [
          "No listings found — check the area, price and bedroom filters",
          ...insights,
        ],
      }
    }

    // ── STEP 2: Tier 1 screen every listing (cheap) ─────────────────────
    const screened: Array<{ listing: ListingCandidate; tier1: Tier1Result }> = []
    for (const listing of found) {
      try {
        screened.push({ listing, tier1: await screenListing(listing, strategies) })
      } catch (err) {
        console.warn("[Discovery] tier1 failed:", err)
      }
    }
    const passers = screened.filter((s) => s.tier1.passesThreshold)
    console.log(
      `[Discovery] ${passers.length}/${screened.length} passed Tier 1`,
    )

    // ── STEP 3: pick the Tier 2 shortlist (capped) ──────────────────────
    const shortlist = [...passers]
      .sort((a, b) => b.tier1.score - a.tier1.score)
      .slice(0, TIER2_CAP)
    const shortlistUrls = new Set(shortlist.map((s) => s.listing.listingUrl))

    // ── STEP 4: persist everything; deep-analyse the shortlist ──────────
    let totalAnalysed = 0
    const strongDeals: Array<{ address: string; strategy: string; score: number }> = []

    for (const { listing, tier1 } of screened) {
      const row: Record<string, unknown> = {
        search_id: searchId,
        listing_url: listing.listingUrl,
        listing_id: listing.listingId,
        address: listing.address,
        postcode: listing.postcode,
        price: listing.price,
        bedrooms: listing.bedrooms,
        property_type: listing.propertyType,
        thumbnail_url: listing.thumbnailUrl,
        tier1_signals: { ...tier1.signals, strategySignals: tier1.strategySignals },
        tier1_score: tier1.score,
        passed_tier1: tier1.passesThreshold,
        status: "screened",
        found_at: new Date().toISOString(),
      }

      if (shortlistUrls.has(listing.listingUrl)) {
        try {
          const deep = await runDeepAnalysis(listing, strategies)
          if (Object.keys(deep.strategyResults).length > 0) {
            row.full_analysis = deep.strategyResults
            row.strategy_scores = Object.fromEntries(
              Object.entries(deep.strategyResults).map(([k, v]) => [k, v.score]),
            )
            row.best_strategy = deep.bestStrategy
            row.best_score = deep.bestScore
            row.status = "analysed"
            totalAnalysed++
            if (deep.bestScore >= 70) {
              strongDeals.push({
                address: listing.address,
                strategy: deep.bestStrategy,
                score: deep.bestScore,
              })
            }
          }
        } catch (err) {
          console.warn("[Discovery] tier2 failed:", err)
        }
        await sleep(DEEP_DELAY_MS)
      }

      const { error: upsertErr } = await this.supabase
        .from("discovery_results")
        .upsert(row, { onConflict: "search_id,listing_url" })
      if (upsertErr) {
        console.warn("[Discovery] upsert failed:", upsertErr.message)
      }
    }

    await this.touchLastRun(searchId)

    // ── STEP 5: notify on strong finds ──────────────────────────────────
    for (const d of strongDeals) {
      insights.push(`Strong ${d.strategy} deal: ${d.address} — score ${d.score}`)
    }
    if (strongDeals.length > 0 && search.user_id) {
      await this.notifyUser(search.user_id, search.search_name, strongDeals).catch(
        (err) => console.warn("[Discovery] notify failed:", err),
      )
    }

    return {
      itemsProcessed: totalFound,
      insights: [
        `${totalFound} listings scanned across ${areas.length} area(s)`,
        `${passers.length} passed the Tier 1 screen`,
        `${totalAnalysed} fully analysed (cap ${TIER2_CAP})`,
        ...insights,
      ],
    }
  }

  private async touchLastRun(searchId: string): Promise<void> {
    await this.supabase
      .from("discovery_searches")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", searchId)
  }

  /** Email the owner when a run turns up strong deals. */
  private async notifyUser(
    userId: string,
    searchName: string | null,
    deals: Array<{ address: string; strategy: string; score: number }>,
  ): Promise<void> {
    const { data } = await this.supabase.auth.admin.getUserById(userId)
    const email = data?.user?.email
    if (!email) return

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.metalyzi.co.uk"
    const rows = deals
      .slice(0, 10)
      .map(
        (d) => `
        <tr>
          <td style="padding:8px 0;color:#ffffff;font-size:14px;">${d.address}</td>
          <td style="padding:8px 0;color:#2dd4bf;font-size:14px;text-align:right;">
            ${d.strategy} · ${d.score}/100
          </td>
        </tr>`,
      )
      .join("")

    await sendBrevoEmail(
      email,
      `${deals.length} strong deal${deals.length === 1 ? "" : "s"} found${
        searchName ? ` — ${searchName}` : ""
      }`,
      baseTemplate(`
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#ffffff;text-align:center;">
          Your discovery search found ${deals.length} strong deal${deals.length === 1 ? "" : "s"}
        </h1>
        <p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.7;text-align:center;">
          Scored ${deals.length === 1 ? "70+" : "70 or above"} by the Metalyzi deal engine.
          Open Discovery to review the full analysis.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">${rows}</table>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center">
            <a href="${siteUrl}/discovery"
               style="display:inline-block;background:#ffffff;color:#0f0f0f;font-size:15px;font-weight:700;padding:14px 36px;border-radius:8px;text-decoration:none;">
              View Discovery Results
            </a>
          </td></tr>
        </table>
        <p style="margin:24px 0 0;font-size:12px;color:#4b5563;line-height:1.6;text-align:center;">
          Scores are automated estimates from area data and platform defaults — always verify
          the numbers against your own assumptions before offering.
        </p>
      `),
    )
  }

  /** Dispatcher entry point — runs recurring searches that are due. */
  async execute(): Promise<AgentResult> {
    const { data } = await this.supabase
      .from("discovery_searches")
      .select("id, frequency, last_run_at")
      .eq("is_recurring", true)
      .eq("status", "active")

    const rows = (data ?? []) as unknown as Array<{
      id: string
      frequency: string | null
      last_run_at: string | null
    }>

    const now = Date.now()
    const DAY = 86_400_000
    const due = rows.filter((r) => {
      if (!r.last_run_at) return true
      const age = now - new Date(r.last_run_at).getTime()
      if (!Number.isFinite(age)) return true
      // 20h/6.5d thresholds so a once-daily dispatcher fires on cadence.
      return (r.frequency ?? "weekly") === "daily" ? age >= 20 * 3_600_000 : age >= 6.5 * DAY
    })

    const insights: string[] = []
    for (const r of due) {
      try {
        const res = await this.runSearch(r.id)
        insights.push(...res.insights)
      } catch (err) {
        console.warn(`[Discovery] recurring run failed for ${r.id}:`, err)
      }
    }

    return {
      itemsProcessed: due.length,
      insights: due.length
        ? [`${due.length} recurring search(es) run`, ...insights]
        : ["No recurring searches due"],
    }
  }
}
