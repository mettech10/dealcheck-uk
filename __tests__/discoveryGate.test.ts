/**
 * Discovery gating — Pro-only access and the monthly search allowance.
 * Supabase + the tier RPC are mocked so this is pure and deterministic.
 */
import { describe, expect, test, vi, beforeEach } from "vitest"

const state = vi.hoisted(() => ({
  tier: "pro" as string,
  used: 0 as number,
}))

vi.mock("@/lib/usageGate", () => ({
  checkCanAnalyse: vi.fn(async () => ({ tier: state.tier })),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { discovery_searches_used: state.used },
            }),
          }),
        }),
      }),
      upsert: async () => ({ error: null }),
    }),
  }),
}))

import {
  checkDiscoveryAccess,
  DISCOVERY_MONTHLY_LIMIT,
  DISCOVERY_MAX_AREAS,
  currentPeriodStart,
} from "@/lib/discovery/gate"

beforeEach(() => {
  state.tier = "pro"
  state.used = 0
})

describe("Discovery gate — tier", () => {
  test("anonymous is refused", async () => {
    const g = await checkDiscoveryAccess(null)
    expect(g.allowed).toBe(false)
    expect(g.reason).toBe("tier")
  })

  test.each(["free", "payg", "pay_per_analysis"])("%s tier is refused", async (tier) => {
    state.tier = tier
    const g = await checkDiscoveryAccess("u1")
    expect(g.allowed).toBe(false)
    expect(g.reason).toBe("tier")
    expect(g.message).toMatch(/Pro feature/i)
  })

  test.each(["pro", "enterprise", "unlimited"])("%s tier is allowed", async (tier) => {
    state.tier = tier
    const g = await checkDiscoveryAccess("u1")
    expect(g.allowed).toBe(true)
    expect(g.reason).toBeNull()
  })

  test("an unknown tier fails CLOSED (discovery spends money)", async () => {
    state.tier = "something_new"
    const g = await checkDiscoveryAccess("u1")
    expect(g.allowed).toBe(false)
    expect(g.reason).toBe("tier")
  })
})

describe("Discovery gate — monthly allowance", () => {
  test("allows up to the limit", async () => {
    state.used = DISCOVERY_MONTHLY_LIMIT - 1
    const g = await checkDiscoveryAccess("u1")
    expect(g.allowed).toBe(true)
    expect(g.used).toBe(DISCOVERY_MONTHLY_LIMIT - 1)
  })

  test("blocks the 6th search with a clear message", async () => {
    state.used = DISCOVERY_MONTHLY_LIMIT
    const g = await checkDiscoveryAccess("u1")
    expect(g.allowed).toBe(false)
    expect(g.reason).toBe("limit")
    expect(g.message).toMatch(/all 5 discovery searches/i)
    expect(g.message).toMatch(/resets/i)
  })

  test("limits are the documented values", () => {
    expect(DISCOVERY_MONTHLY_LIMIT).toBe(5)
    expect(DISCOVERY_MAX_AREAS).toBe(3)
  })
})

describe("Discovery gate — period key", () => {
  test("is the 1st of the current UTC month (matches user_usage)", () => {
    const p = currentPeriodStart()
    expect(p).toMatch(/^\d{4}-\d{2}-01$/)
    const d = new Date()
    expect(p.startsWith(`${d.getUTCFullYear()}-`)).toBe(true)
  })
})
