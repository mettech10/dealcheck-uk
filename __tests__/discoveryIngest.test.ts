/**
 * Deal Discovery — ingestion pipeline (layers 1→3).
 *
 * Covers the normalisation core as pure functions, then drives the full
 * ingestListings() orchestration against an in-memory Supabase double so the
 * raw → quarantine → canonical flow is exercised end to end without a live DB.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  normaliseAddress,
  normalisePostcode,
  propertyKey,
  normaliseCard,
  ingestListings,
  resetGeoCache,
} from "@/lib/discovery/ingest"

// ── In-memory Supabase double ──────────────────────────────────────────────
// Implements just the query surface ingest.ts uses: insert/select/eq/
// maybeSingle/single/update/in/not/lt.

type Row = Record<string, any>

function makeDb() {
  const tables: Record<string, Row[]> = {
    discovery_raw_listings: [],
    discovery_quarantine: [],
    properties: [],
    property_listings: [],
  }
  let idSeq = 0
  const nextId = () => `id-${++idSeq}`

  function from(table: string) {
    const rows = () => (tables[table] ??= [])

    // Builder shared by select/update paths
    const makeQuery = (mode: "select" | "update", patch?: Row) => {
      const filters: Array<(r: Row) => boolean> = []
      const q: any = {
        eq(col: string, val: unknown) {
          filters.push((r) => r[col] === val)
          return q
        },
        in(col: string, vals: unknown[]) {
          filters.push((r) => vals.includes(r[col]))
          return q
        },
        not() {
          return q
        },
        lt(col: string, val: string) {
          filters.push((r) => String(r[col]) < String(val))
          return q
        },
        select() {
          if (mode === "update") {
            const hit = rows().filter((r) => filters.every((f) => f(r)))
            hit.forEach((r) => Object.assign(r, patch))
            return Promise.resolve({ data: hit, error: null })
          }
          return q
        },
        maybeSingle() {
          const hit = rows().find((r) => filters.every((f) => f(r)))
          return Promise.resolve({ data: hit ?? null, error: null })
        },
        single() {
          const hit = rows().find((r) => filters.every((f) => f(r)))
          return Promise.resolve({
            data: hit ?? null,
            error: hit ? null : { message: "not found" },
          })
        },
        then(resolve: (v: any) => void) {
          const hit = rows().filter((r) => filters.every((f) => f(r)))
          if (mode === "update") hit.forEach((r) => Object.assign(r, patch))
          return Promise.resolve({ data: hit, error: null }).then(resolve)
        },
      }
      return q
    }

    return {
      insert(payload: Row | Row[]) {
        const list = Array.isArray(payload) ? payload : [payload]
        const created = list.map((r) => ({ id: nextId(), ...r }))
        rows().push(...created)
        const result = { data: created, error: null }
        const api: any = {
          select() {
            return {
              single: () => Promise.resolve({ data: created[0], error: null }),
              then: (res: (v: any) => void) => Promise.resolve(result).then(res),
            }
          },
          then: (res: (v: any) => void) => Promise.resolve(result).then(res),
        }
        return api
      },
      select() {
        return makeQuery("select")
      },
      update(patch: Row) {
        return makeQuery("update", patch)
      },
    }
  }

  return { client: { from } as any, tables }
}

/** A realistic Rightmove search card. */
function card(over: Partial<Row> = {}): Row {
  return {
    listingId: "1234",
    listingUrl: "https://www.rightmove.co.uk/properties/1234",
    address: "14 Beresford Road, Manchester, M13 9PL",
    price: 215000,
    priceText: "£215,000",
    bedrooms: 3,
    bathrooms: 1,
    propertyType: "Terraced",
    tenure: "freehold",
    thumbnailUrl: "https://img/1.jpg",
    description: "A three bed terrace",
    addedDate: "2026-08-01",
    isReduced: false,
    ...over,
  }
}

beforeEach(() => {
  resetGeoCache()
  // Geocoding is an enrichment, not the unit under test — stub it so the suite
  // never depends on postcodes.io being reachable.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ result: { latitude: 53.4631, longitude: -2.2339 } }), {
        status: 200,
      }),
    ),
  )
})

// ── Layer 2: normalisation primitives ──────────────────────────────────────

describe("normalisation primitives", () => {
  it("canonicalises a UK postcode from any spacing or case", () => {
    expect(normalisePostcode("m139pl")).toBe("M13 9PL")
    expect(normalisePostcode("M13  9PL")).toBe("M13 9PL")
    expect(normalisePostcode("14 Beresford Road, M13 9PL")).toBe("M13 9PL")
    expect(normalisePostcode("not a postcode")).toBe("")
  })

  it("strips punctuation, case and the trailing postcode from an address", () => {
    expect(normaliseAddress("14 Beresford Road, Manchester, M13 9PL")).toBe(
      "14 BERESFORD ROAD MANCHESTER",
    )
  })

  it("gives the same dedup key for the same property written differently", () => {
    const a = propertyKey("14 Beresford Road, Manchester, M13 9PL", "M13 9PL")
    const b = propertyKey("14 BERESFORD ROAD, Manchester", "m13 9pl")
    expect(a).toBe(b)
  })

  it("gives different keys to different properties", () => {
    expect(propertyKey("14 Beresford Road", "M13 9PL")).not.toBe(
      propertyKey("16 Beresford Road", "M13 9PL"),
    )
  })
})

describe("normaliseCard validation", () => {
  it("accepts a complete card", () => {
    const out = normaliseCard(card())
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.card.postcode).toBe("M13 9PL")
      expect(out.card.district).toBe("M13")
      expect(out.card.price).toBe(215000)
    }
  })

  it("quarantines a card with no price", () => {
    const out = normaliseCard(card({ price: 0 }))
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.missingFields).toContain("price")
  })

  it("quarantines a card with no address or URL, listing every missing field", () => {
    const out = normaliseCard({ price: 100000 })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.missingFields).toEqual(expect.arrayContaining(["listingUrl", "address"]))
    }
  })

  it("falls back to the searched area when the card has no postcode", () => {
    const out = normaliseCard(card({ address: "Beresford Road, Manchester", postcode: "" }), "M13")
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.card.district).toBe("M13")
  })
})

// ── Layers 1→3: the pipeline ───────────────────────────────────────────────

describe("ingestListings pipeline", () => {
  it("lands raw payloads before anything is transformed", async () => {
    const { client, tables } = makeDb()
    await ingestListings({
      supabase: client,
      runId: "run-1",
      source: "rightmove_search",
      cards: [card(), card({ listingId: "2", listingUrl: "https://x/2", address: "9 Elm St, M14 5AA" })],
    })

    expect(tables.discovery_raw_listings).toHaveLength(2)
    const raw = tables.discovery_raw_listings[0]
    // Raw must be untouched and carry source metadata
    expect(raw.payload.address).toBe("14 Beresford Road, Manchester, M13 9PL")
    expect(raw.source).toBe("rightmove_search")
    expect(raw.confidence).toBe(0.7)
    expect(raw.scraped_at).toBeTruthy()
    expect(raw.run_id).toBe("run-1")
    // and be marked processed once the run completes
    expect(raw.processed).toBe(true)
  })

  it("quarantines invalid records instead of dropping or including them", async () => {
    const { client, tables } = makeDb()
    const summary = await ingestListings({
      supabase: client,
      runId: "run-2",
      source: "rightmove_search",
      cards: [card(), card({ listingUrl: "https://x/3", address: "", price: 0 })],
    })

    expect(summary.rawWritten).toBe(2) // both landed raw
    expect(summary.quarantined).toBe(1) // one rejected
    expect(summary.listings).toHaveLength(1) // only the good one proceeds
    expect(tables.discovery_quarantine).toHaveLength(1)
    expect(tables.discovery_quarantine[0].missing_fields).toEqual(
      expect.arrayContaining(["address", "price"]),
    )
    expect(tables.discovery_quarantine[0].reason).toMatch(/missing/i)
  })

  it("dedupes the same property across separate runs into one canonical row", async () => {
    const { client, tables } = makeDb()
    await ingestListings({
      supabase: client,
      runId: "run-a",
      source: "rightmove_search",
      cards: [card()],
    })
    // Same house, different search, address written differently
    await ingestListings({
      supabase: client,
      runId: "run-b",
      source: "rightmove_search",
      cards: [card({ address: "14 BERESFORD ROAD, Manchester" , postcode: "M13 9PL" })],
    })

    expect(tables.properties).toHaveLength(1)
    expect(tables.discovery_raw_listings).toHaveLength(2) // both raws kept
  })

  it("dedupes within a single batch", async () => {
    const { client, tables } = makeDb()
    const summary = await ingestListings({
      supabase: client,
      runId: "run-3",
      source: "rightmove_search",
      cards: [card(), card({ listingUrl: "https://x/dupe" })],
    })
    expect(tables.properties).toHaveLength(1)
    expect(summary.listings).toHaveLength(1)
  })

  it("records a listing observation with staleness fields", async () => {
    const { client, tables } = makeDb()
    await ingestListings({
      supabase: client,
      runId: "run-4",
      source: "rightmove_search",
      cards: [card()],
    })
    const obs = tables.property_listings[0]
    expect(obs.price).toBe(215000)
    expect(obs.status).toBe("active")
    expect(obs.first_seen).toBeTruthy()
    expect(obs.last_seen).toBeTruthy()
    expect(obs.source_url).toBe("https://www.rightmove.co.uk/properties/1234")

    const prop = tables.properties[0]
    expect(prop.first_seen).toBeTruthy()
    expect(prop.status).toBe("active")
    expect(prop.postcode_district).toBe("M13")
  })

  it("geocodes the property so geo-radius search has coordinates", async () => {
    const { client, tables } = makeDb()
    await ingestListings({
      supabase: client,
      runId: "run-5",
      source: "rightmove_search",
      cards: [card()],
    })
    expect(tables.properties[0].latitude).toBeCloseTo(53.4631, 3)
    expect(tables.properties[0].longitude).toBeCloseTo(-2.2339, 3)
  })

  it("still ingests when geocoding fails — enrichment never blocks the pipeline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })))
    const { client, tables } = makeDb()
    const summary = await ingestListings({
      supabase: client,
      runId: "run-6",
      source: "rightmove_search",
      cards: [card()],
    })
    expect(summary.listings).toHaveLength(1)
    expect(tables.properties[0].latitude).toBeNull()
  })

  it("returns canonical listings carrying the property id for downstream linking", async () => {
    const { client } = makeDb()
    const summary = await ingestListings({
      supabase: client,
      runId: "run-7",
      source: "rightmove_search",
      cards: [card()],
    })
    expect(summary.listings[0].propertyId).toBeTruthy()
    expect(summary.listings[0].district).toBe("M13")
    expect(summary.listings[0].price).toBe(215000)
  })

  it("refuses to process anything if the raw write fails", async () => {
    const failing: any = {
      from: () => ({
        insert: () => ({
          select: () => Promise.resolve({ data: null, error: { message: "boom" } }),
          then: (r: any) => Promise.resolve({ data: null, error: { message: "boom" } }).then(r),
        }),
      }),
    }
    await expect(
      ingestListings({
        supabase: failing,
        runId: "run-8",
        source: "rightmove_search",
        cards: [card()],
      }),
    ).rejects.toThrow(/raw landing write failed/)
  })
})
