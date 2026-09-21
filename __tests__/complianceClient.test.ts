/**
 * Dual-SoT hold: production/preview must never construct the localStorage stub.
 */
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  getComplianceClient,
  resetComplianceClientCache,
  stubAllowed,
} from "@/lib/compliance/client"
import { createStubClient } from "@/lib/compliance/stub"
import { assertComplianceStubAllowed, isComplianceStubHost } from "@/lib/compliance/host"
import { memoryStorage } from "@/lib/compliance/stub"

function failingFetch(): typeof fetch {
  return vi.fn(async () => {
    throw new Error("Flask /v1/compliance is unreachable")
  }) as unknown as typeof fetch
}

function statusFetch(status: number, body: unknown = {}): typeof fetch {
  return vi.fn(async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  }) as unknown as typeof fetch
}

afterEach(() => {
  resetComplianceClientCache()
})

describe("host gates", () => {
  test("loopback is the only stub host", () => {
    expect(isComplianceStubHost("localhost")).toBe(true)
    expect(isComplianceStubHost("127.0.0.1")).toBe(true)
    expect(isComplianceStubHost("www.metalyzi.co.uk")).toBe(false)
    expect(isComplianceStubHost("dealcheck-uk.vercel.app")).toBe(false)
    expect(isComplianceStubHost("preview.metalyzi.co.uk")).toBe(false)
  })

  test("stubAllowed is false on production even with allowStub", () => {
    expect(stubAllowed({ hostname: "www.metalyzi.co.uk" })).toBe(false)
    expect(stubAllowed({ hostname: "www.metalyzi.co.uk", allowStub: true })).toBe(false)
    expect(stubAllowed({ hostname: "www.metalyzi.co.uk", demo: true })).toBe(false)
    expect(stubAllowed({ hostname: "localhost" })).toBe(true)
    expect(stubAllowed({ hostname: "127.0.0.1" })).toBe(true)
    expect(stubAllowed({ allowStub: true })).toBe(true)
  })

  test("createStubClient throws on a production hostname", () => {
    expect(() => createStubClient({ hostname: "www.metalyzi.co.uk" })).toThrow(
      /stub refused/,
    )
    expect(() => createStubClient({ hostname: "metalyzi.co.uk" })).toThrow(
      /stub refused/,
    )
    expect(() =>
      assertComplianceStubAllowed("dealcheck-uk-git-preview.vercel.app"),
    ).toThrow(/stub refused/)
  })

  test("unit tests may still construct a memory stub", async () => {
    const api = createStubClient({ storage: memoryStorage() })
    const cat = await api.getCatalogue()
    expect(cat).toHaveLength(7)
  })
})

describe("getComplianceClient fail-closed", () => {
  test("production signed-in path is unavailable (never a stub) when catalogue fails", async () => {
    const handle = await getComplianceClient({
      hostname: "www.metalyzi.co.uk",
      fetch: failingFetch(),
      force: true,
    })
    expect(handle.source).toBe("unavailable")
    expect(handle.api).toBeNull()
    expect(handle.error).toMatch(/did not fall back to a local store/)
  })

  test("production HTTP 502 catalogue is unavailable, not stub", async () => {
    const handle = await getComplianceClient({
      hostname: "preview.metalyzi.co.uk",
      fetch: statusFetch(502, { error: "compliance_upstream_unavailable" }),
      force: true,
    })
    expect(handle.source).toBe("unavailable")
    expect(handle.api).toBeNull()
  })

  test("localhost may use the stub when the probe fails", async () => {
    const handle = await getComplianceClient({
      hostname: "localhost",
      fetch: failingFetch(),
      force: true,
    })
    expect(handle.source).toBe("stub")
    expect(handle.api).not.toBeNull()
    await expect(handle.api!.getCatalogue()).resolves.toHaveLength(7)
  })

  test("127.0.0.1 demo hatch uses the stub without calling live", async () => {
    const fetchSpy = failingFetch()
    const handle = await getComplianceClient({
      hostname: "127.0.0.1",
      demo: true,
      fetch: fetchSpy,
      force: true,
    })
    expect(handle.source).toBe("stub")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test("production demo query cannot enable the stub", async () => {
    const handle = await getComplianceClient({
      hostname: "www.metalyzi.co.uk",
      demo: true,
      fetch: failingFetch(),
      force: true,
    })
    expect(handle.source).toBe("unavailable")
    expect(handle.api).toBeNull()
  })

  test("allowStub cannot override a production hostname", async () => {
    const handle = await getComplianceClient({
      hostname: "www.metalyzi.co.uk",
      allowStub: true,
      fetch: failingFetch(),
      force: true,
    })
    expect(handle.source).toBe("unavailable")
    expect(handle.api).toBeNull()
  })

  test("signed-in production uses the live client when catalogue {items} is ok", async () => {
    const fetchSpy = statusFetch(200, {
      success: true,
      items: [{ code: "GAS", name: "Gas Safety Certificate (CP12)" }],
    })
    const handle = await getComplianceClient({
      hostname: "www.metalyzi.co.uk",
      fetch: fetchSpy,
      force: true,
    })
    expect(handle.source).toBe("live")
    expect(handle.api).not.toBeNull()
    expect(String((fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).toContain(
      "/api/compliance/catalogue",
    )
    await expect(handle.api!.putSettings({ reminderDays: [30] })).rejects.toThrow(
      /no PUT \/v1\/compliance\/settings/,
    )
    await expect(handle.api!.deleteEvidence("p", "GAS", "e")).rejects.toThrow(
      /no DELETE evidence/,
    )
  })

  test("live dashboard and property file surface analyzer error messages", async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/catalogue")) {
        return new Response(
          JSON.stringify({
            success: true,
            items: [{ code: "GAS", name: "Gas Safety Certificate (CP12)" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      return new Response(
        JSON.stringify({
          success: false,
          message:
            "Apply supabase/migrations/20260914_compliance_cockpit.sql",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      )
    }) as unknown as typeof fetch
    const handle = await getComplianceClient({
      hostname: "www.metalyzi.co.uk",
      fetch: fetchSpy,
      force: true,
    })
    expect(handle.source).toBe("live")
    await expect(handle.api!.getDashboard([])).rejects.toThrow(
      /20260914_compliance_cockpit/,
    )
    await expect(
      handle.api!.upsertProperty({
        propertyId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        address: "1 Test Street",
        nickname: null,
        postcode: null,
        strategy: null,
        bedrooms: null,
      }),
    ).rejects.toThrow(/Failed to load property obligations|20260914_compliance_cockpit/)
  })
})

