/**
 * Sold-comparable ingestion — the path that feeds the comps engine.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  parseSoldDate,
  normaliseSoldCard,
  ingestSoldComps,
} from "@/lib/discovery/ingestSold"
import { resetGeoCache } from "@/lib/discovery/ingest"

type Row = Record<string, any>

/** Minimal in-memory Supabase double (same surface ingestSold uses). */
function makeDb() {
  const tables: Record<string, Row[]> = {
    discovery_raw_listings: [],
    discovery_quarantine: [],
    properties: [],
    property_sales: [],
  }
  let seq = 0
  const nextId = () => `id-${++seq}`

  function from(table: string) {
    const rows = () => (tables[table] ??= [])
    const makeQuery = (mode: "select" | "update", patch?: Row) => {
      const filters: Array<(r: Row) => boolean> = []
      const q: any = {
        eq(col: string, val: unknown) {
          filters.push((r) => String(r[col]) === String(val))
          return q
        },
        maybeSingle() {
          const hit = rows().find((r) => filters.every((f) => f(r)))
          return Promise.resolve({ data: hit ?? null, error: null })
        },
        single() {
          const hit = rows().find((r) => filters.every((f) => f(r)))
          return Promise.resolve({ data: hit ?? null, error: hit ? null : { message: "nf" } })
        },
        select() {
          return q
        },
        then(res: (v: any) => void) {
          const hit = rows().filter((r) => filters.every((f) => f(r)))
          if (mode === "update") hit.forEach((r) => Object.assign(r, patch))
          return Promise.resolve({ data: hit, error: null }).then(res)
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
        return {
          select: () => ({
            single: () => Promise.resolve({ data: created[0], error: null }),
            then: (res: (v: any) => void) => Promise.resolve(result).then(res),
          }),
          then: (res: (v: any) => void) => Promise.resolve(result).then(res),
        } as any
      },
      select: () => makeQuery("select"),
      update: (patch: Row) => makeQuery("update", patch),
    }
  }
  return { client: { from } as any, tables }
}

function sold(over: Partial<Row> = {}): Row {
  return {
    address: "22 Ashley Road, Manchester, M14 5AA",
    price: 205000,
    dateSold: "12 Mar 2025",
    propertyType: "Terraced",
    bedrooms: 3,
    tenure: "Freehold",
    floorSizeM2: 93,
    listingUrl: "https://www.rightmove.co.uk/house-prices/detail/1",
    ...over,
  }
}

beforeEach(() => {
  resetGeoCache()
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ result: { latitude: 53.447, longitude: -2.226 } }), {
        status: 200,
      }),
    ),
  )
})

describe("parseSoldDate", () => {
  it("parses Rightmove's display format", () => {
    expect(parseSoldDate("12 Mar 2025")).toBe("2025-03-12")
  })
  it("passes ISO through", () => {
    expect(parseSoldDate("2025-03-12T00:00:00Z")).toBe("2025-03-12")
  })
  it("rejects unusable values rather than inventing a date", () => {
    expect(parseSoldDate("")).toBeNull()
    expect(parseSoldDate(null)).toBeNull()
    expect(parseSoldDate("soon")).toBeNull()
    // A bare number must not become year 2001
    expect(parseSoldDate("3")).toBeNull()
  })
})

describe("normaliseSoldCard", () => {
  it("normalises a complete sold record", () => {
    const out = normaliseSoldCard(sold())
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.sale.soldPrice).toBe(205000)
      expect(out.sale.soldDate).toBe("2025-03-12")
      expect(out.sale.postcode).toBe("M14 5AA")
      expect(out.sale.district).toBe("M14")
      // 93 m² → ~1001 sqft
      expect(out.sale.floorAreaSqft).toBeGreaterThan(990)
      expect(out.sale.floorAreaSqft).toBeLessThan(1010)
    }
  })

  it("quarantines a sale with no date — it cannot be weighted for recency", () => {
    const out = normaliseSoldCard(sold({ dateSold: "" }))
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.missingFields).toContain("dateSold")
  })

  it("quarantines a sale with no price", () => {
    const out = normaliseSoldCard(sold({ price: 0 }))
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.missingFields).toContain("price")
  })

  it("prefers an explicit sqft over converting from m²", () => {
    const out = normaliseSoldCard(sold({ floorSizeSqft: 1234, floorSizeM2: 93 }))
    if (out.ok) expect(out.sale.floorAreaSqft).toBe(1234)
  })
})

describe("ingestSoldComps", () => {
  it("lands raw, then records a canonical property and its sale", async () => {
    const { client, tables } = makeDb()
    const s = await ingestSoldComps({ supabase: client, runId: "r1", cards: [sold()] })

    expect(s.rawWritten).toBe(1)
    expect(s.salesRecorded).toBe(1)
    expect(tables.discovery_raw_listings[0].source).toBe("rightmove_sold")
    expect(tables.discovery_raw_listings[0].confidence).toBe(0.85)
    expect(tables.discovery_raw_listings[0].processed).toBe(true)
    expect(tables.properties).toHaveLength(1)
    expect(tables.property_sales[0].sold_price).toBe(205000)
    expect(tables.property_sales[0].sold_date).toBe("2025-03-12")
  })

  it("is idempotent — re-scraping the same sale adds no new comp", async () => {
    const { client, tables } = makeDb()
    await ingestSoldComps({ supabase: client, runId: "r1", cards: [sold()] })
    const second = await ingestSoldComps({ supabase: client, runId: "r2", cards: [sold()] })

    expect(second.duplicatesSkipped).toBe(1)
    expect(second.salesRecorded).toBe(0)
    expect(tables.property_sales).toHaveLength(1) // still one comp
    expect(tables.properties).toHaveLength(1) // still one property
  })

  it("records a genuine second sale of the same property", async () => {
    const { client, tables } = makeDb()
    await ingestSoldComps({ supabase: client, runId: "r1", cards: [sold()] })
    await ingestSoldComps({
      supabase: client,
      runId: "r2",
      cards: [sold({ dateSold: "01 Feb 2020", price: 150000 })],
    })
    expect(tables.properties).toHaveLength(1) // same house
    expect(tables.property_sales).toHaveLength(2) // two transactions
  })

  it("quarantines bad records without blocking the good ones", async () => {
    const { client, tables } = makeDb()
    const s = await ingestSoldComps({
      supabase: client,
      runId: "r1",
      cards: [sold(), sold({ address: "", price: 0, dateSold: "" })],
    })
    expect(s.rawWritten).toBe(2)
    expect(s.quarantined).toBe(1)
    expect(s.salesRecorded).toBe(1)
    expect(tables.discovery_quarantine[0].missing_fields).toEqual(
      expect.arrayContaining(["address", "price", "dateSold"]),
    )
  })

  it("does not mark an already-active property as sold", async () => {
    const { client, tables } = makeDb()
    // Property already exists from active-listing ingestion
    tables.properties.push({
      id: "existing",
      property_key: (await import("@/lib/discovery/ingest")).propertyKey(
        "22 Ashley Road, Manchester, M14 5AA",
        "M14 5AA",
      ),
      status: "active",
      latitude: 53.447,
    })

    await ingestSoldComps({ supabase: client, runId: "r1", cards: [sold()] })

    expect(tables.properties).toHaveLength(1)
    expect(tables.properties[0].status).toBe("active") // not downgraded
    expect(tables.property_sales).toHaveLength(1) // sale still recorded
  })

  it("aborts if the raw write fails — nothing is processed unrecorded", async () => {
    const failing: any = {
      from: () => ({
        insert: () => ({
          select: () => Promise.resolve({ data: null, error: { message: "boom" } }),
        }),
      }),
    }
    await expect(
      ingestSoldComps({ supabase: failing, runId: "r1", cards: [sold()] }),
    ).rejects.toThrow(/sold raw landing write failed/)
  })
})
