/**
 * DiscoveryAgent orchestration — the cost-control and persistence rules.
 *
 * The scraper, screener, deep-analysis and Supabase are all mocked, so this
 * asserts the ORCHESTRATION contract:
 *   • Tier 2 is capped at TIER2_CAP (non-negotiable cost control)
 *   • only Tier 1 passers are deep-analysed, highest score first
 *   • EVERY screened listing is persisted, failures included
 */
import { describe, expect, test, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({
  listings: [] as Array<Record<string, unknown>>,
  search: {} as Record<string, unknown>,
  upserts: [] as Array<Record<string, unknown>>,
  deepCalls: [] as string[],
  passUrls: new Set<string>(),
  scores: new Map<string, number>(),
}))

vi.mock("@/lib/scrapers/rightmove-search-scraper", () => ({
  scrapeRightmoveSearch: vi.fn(async () => h.listings),
}))

vi.mock("@/lib/discovery/tier1Screen", () => ({
  screenListing: vi.fn(async (l: { listingUrl: string }) => ({
    signals: { article4Status: "none", missingData: [] },
    score: h.scores.get(l.listingUrl) ?? 0,
    strategySignals: [],
    passesThreshold: h.passUrls.has(l.listingUrl),
  })),
}))

vi.mock("@/lib/discovery/tier2Analyse", () => ({
  runDeepAnalysis: vi.fn(async (l: { listingUrl: string }) => {
    h.deepCalls.push(l.listingUrl)
    return {
      strategyResults: { BTL: { score: 72, label: "Good", summary: {}, assumptions: [] } },
      bestStrategy: "BTL",
      bestScore: 72,
    }
  }),
}))

vi.mock("@/lib/discovery/areaIntel", () => ({ resetDistrictIntelCache: vi.fn() }))
vi.mock("@/lib/brevo-email", () => ({
  sendBrevoEmail: vi.fn(async () => true),
  baseTemplate: (s: string) => s,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: async () => ({ data: { user: { email: null } } }) } },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: table === "discovery_searches" ? h.search : null, error: null }),
          eq: () => ({ data: [], error: null }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async (row: Record<string, unknown>) => {
        h.upserts.push(row)
        return { error: null }
      },
    }),
  }),
}))

import { DiscoveryAgent, TIER2_CAP } from "@/lib/agents/DiscoveryAgent"

function makeListings(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    listingId: String(i),
    listingUrl: `https://rm/${i}`,
    address: `${i} Test St`,
    postcode: "M14 5AA",
    price: 200000 + i,
    bedrooms: 3,
    bathrooms: 1,
    propertyType: "house",
    thumbnailUrl: null,
    description: "",
  }))
}

beforeEach(() => {
  vi.useFakeTimers()
  h.upserts = []
  h.deepCalls = []
  h.search = {
    id: "s1",
    user_id: null,
    search_name: "test",
    postcode_areas: ["M14"],
    strategies: ["BTL"],
  }
})

/** Runs the agent with timers auto-advanced past the rate-limit sleeps. */
async function runAgent() {
  const agent = new DiscoveryAgent()
  const p = agent.runSearch("s1")
  await vi.runAllTimersAsync()
  return p
}

describe("DiscoveryAgent — cost control", () => {
  test(`deep-analyses at most ${TIER2_CAP} listings even when far more pass`, async () => {
    h.listings = makeListings(40)
    h.passUrls = new Set(h.listings.map((l) => l.listingUrl as string))
    h.scores = new Map(h.listings.map((l, i) => [l.listingUrl as string, i]))

    const res = await runAgent()

    expect(TIER2_CAP).toBe(15)
    expect(h.deepCalls.length).toBe(TIER2_CAP)
    expect(res.itemsProcessed).toBe(40)
  })

  test("deep analysis goes to the HIGHEST Tier 1 scores first", async () => {
    h.listings = makeListings(20)
    h.passUrls = new Set(h.listings.map((l) => l.listingUrl as string))
    // listing i has score i → top 15 are indices 19..5
    h.scores = new Map(h.listings.map((l, i) => [l.listingUrl as string, i]))

    await runAgent()

    const analysedIdx = h.deepCalls.map((u) => Number(u.split("/").pop())).sort((a, b) => a - b)
    expect(Math.min(...analysedIdx)).toBe(5)
    expect(Math.max(...analysedIdx)).toBe(19)
  })

  test("listings that fail Tier 1 are never deep-analysed", async () => {
    h.listings = makeListings(10)
    h.passUrls = new Set(["https://rm/3"])
    h.scores = new Map()

    await runAgent()

    expect(h.deepCalls).toEqual(["https://rm/3"])
  })
})

describe("DiscoveryAgent — persistence", () => {
  test("EVERY screened listing is persisted, failures included", async () => {
    h.listings = makeListings(10)
    h.passUrls = new Set(["https://rm/1", "https://rm/2"])
    h.scores = new Map()

    await runAgent()

    expect(h.upserts).toHaveLength(10)
    expect(h.upserts.filter((r) => r.passed_tier1 === true)).toHaveLength(2)
    expect(h.upserts.filter((r) => r.passed_tier1 === false)).toHaveLength(8)
  })

  test("only analysed rows carry scores; screened-only rows stay 'screened'", async () => {
    h.listings = makeListings(4)
    h.passUrls = new Set(["https://rm/0"])
    h.scores = new Map()

    await runAgent()

    const analysed = h.upserts.filter((r) => r.status === "analysed")
    const screened = h.upserts.filter((r) => r.status === "screened")
    expect(analysed).toHaveLength(1)
    expect(analysed[0].best_score).toBe(72)
    expect(screened).toHaveLength(3)
    for (const r of screened) expect(r.best_score).toBeUndefined()
  })

  test("upserts key on (search_id, listing_url) so re-runs don't duplicate", async () => {
    h.listings = makeListings(3)
    h.passUrls = new Set()
    h.scores = new Map()

    await runAgent()

    for (const r of h.upserts) {
      expect(r.search_id).toBe("s1")
      expect(typeof r.listing_url).toBe("string")
    }
  })

  test("a search with no areas or strategies does no work", async () => {
    h.search = { id: "s1", user_id: null, postcode_areas: [], strategies: [] }
    const res = await runAgent()
    expect(res.itemsProcessed).toBe(0)
    expect(h.upserts).toHaveLength(0)
    expect(h.deepCalls).toHaveLength(0)
  })
})
