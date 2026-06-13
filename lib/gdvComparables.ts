/**
 * GDV / ARV comparables — combine three sold-price sources into a single,
 * ranked comparable set with £/m² benchmarks and a three-tier ARV:
 *
 *   1. HM Land Registry comps already embedded in the analysis payload
 *      (`backend.sold_comparables`).
 *   2. The reliable POST /api/comparables/sold route (PropertyData + Land
 *      Registry) — the SAME source that powers the Market Comparables tab,
 *      so the GDV evidence list populates even when the payload carried no
 *      comps and the Rightmove scrape is unavailable.
 *   3. The Rightmove SOLD scraper (POST /api/scraper/sold) for photos.
 *
 * Every network source fails gracefully and independently: if one returns
 * nothing the others still drive the estimate, so the Development / BRRRR /
 * Flip GDV/ARV sections never break.
 */
import type { BackendResults } from "./types"

export type ComparableSource = "land_registry" | "rightmove_sold"

export interface GdvComparable {
  address: string
  price: number
  dateSold?: string
  propertyType?: string
  bedrooms?: number | null
  floorSizeM2?: number | null
  pricePerM2?: number | null
  isNewBuild: boolean
  thumbnailUrl?: string | null
  listingUrl?: string
  source: ComparableSource
  hasImages: boolean
}

export interface GdvComparablesResult {
  conservativeARV: number | null
  midARV: number | null
  optimisticARV: number | null
  avgPrice: number | null
  avgPricePerM2: number | null
  priceRange: { low: number; high: number } | null
  comparables: GdvComparable[]
  rightmoveComps: number
  landRegComps: number
  totalComps: number
  methodology: string
}

/** Map the Land Registry sold_comparables already present in BackendResults. */
export function landRegistryComparables(backend: BackendResults | undefined): GdvComparable[] {
  return (backend?.sold_comparables ?? []).map((c) => ({
    address: c.address,
    price: c.price,
    dateSold: c.date,
    propertyType: c.type,
    bedrooms: c.bedrooms ?? null,
    floorSizeM2: null,
    pricePerM2: null,
    isNewBuild: (c.type ?? "").toLowerCase().includes("new"),
    thumbnailUrl: null,
    listingUrl: "",
    source: "land_registry",
    hasImages: false,
  }))
}

/** Dedupe comps that appear in both sources (same address + similar price). */
function deduplicateComps(comps: GdvComparable[]): GdvComparable[] {
  const seen = new Map<string, GdvComparable>()
  for (const c of comps) {
    const key = `${normaliseAddress(c.address)}|${Math.round(c.price / 1000)}`
    const existing = seen.get(key)
    // Prefer the row that carries images (Rightmove) when duplicated.
    if (!existing || (!existing.hasImages && c.hasImages)) seen.set(key, c)
  }
  return [...seen.values()]
}

function normaliseAddress(a: string): string {
  return (a || "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function areaMedianPricePerM2(comps: GdvComparable[]): number {
  const vals = comps
    .map((c) => (c.floorSizeM2 && c.price ? c.price / c.floorSizeM2 : null))
    .filter((v): v is number => v != null)
  return median(vals) ?? 0
}

function buildMethodologyText(
  total: number,
  avgPricePerM2: number | null,
  postcode: string,
  isNewBuild: boolean,
): string {
  const district = (postcode || "").split(" ")[0].toUpperCase()
  if (total === 0) {
    return `No comparable sales found for ${district}. Add a manual ARV or widen the search.`
  }
  const basis = isNewBuild
    ? "filtered toward refurbished / new-build comparables (top £/m²)"
    : "across all recent sales"
  const ppm2 = avgPricePerM2 ? ` at ~£${Math.round(avgPricePerM2).toLocaleString()}/m²` : ""
  return (
    `GDV/ARV derived from ${total} comparable sale${total === 1 ? "" : "s"} in ${district} ` +
    `${basis}${ppm2}. Sources: HM Land Registry + Rightmove sold listings.`
  )
}

/**
 * Combine Land Registry (from `backend`) with a fresh Rightmove sold scrape
 * and compute £/m² benchmarks + a three-tier ARV against `floorSizeM2`.
 * Runs the scrape client-side; safe to call from the results page.
 */
export async function buildGdvComparables(params: {
  postcode: string
  propertyType?: string
  bedrooms?: number
  floorSizeM2?: number | null
  isNewBuild?: boolean
  backend: BackendResults | undefined
  /** Override the fetchers in tests. */
  fetchRightmove?: (body: unknown) => Promise<{ listings: GdvComparable[] }>
  fetchSold?: (body: unknown) => Promise<{ sales: GdvComparable[] }>
}): Promise<GdvComparablesResult> {
  const landReg = landRegistryComparables(params.backend)

  // Default fetchers — each never throws; empty on any failure.

  // (a) Reliable sold-price route (PropertyData + Land Registry). Same source
  //     as the Market Comparables tab, so GDV evidence appears even when the
  //     analysis payload carried no comps and Rightmove is blocked.
  const defaultFetchSold = async (body: unknown): Promise<{ sales: GdvComparable[] }> => {
    const res = await fetch("/api/comparables/sold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) return { sales: [] }
    const json = await res.json()
    if (!json?.success) return { sales: [] }
    const rows: Record<string, unknown>[] = json.data?.sales ?? json.sales ?? []
    const sales = rows
      .map((s) => {
        const type = String(s.propertyType ?? s.type ?? "")
        return {
          address: String(s.street ?? s.address ?? ""),
          price: Number(s.price ?? 0),
          dateSold: String(s.date ?? ""),
          propertyType: type,
          bedrooms: (s.bedrooms as number | null) ?? null,
          floorSizeM2: null,
          pricePerM2: null,
          isNewBuild: type.toLowerCase().includes("new"),
          thumbnailUrl: null,
          listingUrl: "",
          source: "land_registry" as const,
          hasImages: false,
        }
      })
      .filter((s) => s.price > 1000)
    return { sales }
  }

  // (b) Rightmove sold scrape — adds photos when available.
  const defaultFetchRightmove = async (body: unknown): Promise<{ listings: GdvComparable[] }> => {
    const res = await fetch("/api/scraper/sold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) return { listings: [] as GdvComparable[] }
    const data = await res.json()
    const listings = (data.listings ?? []).map((l: Record<string, unknown>) => ({
      address: String(l.address ?? ""),
      price: Number(l.price ?? 0),
      dateSold: (l.dateSold as string) ?? "",
      propertyType: (l.propertyType as string) ?? "",
      bedrooms: (l.bedrooms as number | null) ?? null,
      floorSizeM2: (l.floorSizeM2 as number | null) ?? null,
      pricePerM2: (l.pricePerM2 as number | null) ?? null,
      isNewBuild: Boolean(l.isNewBuild),
      thumbnailUrl: (l.thumbnailUrl as string | null) ?? null,
      listingUrl: (l.listingUrl as string) ?? "",
      source: "rightmove_sold" as const,
      hasImages: Boolean(l.thumbnailUrl),
    }))
    return { listings }
  }

  const soldBody = {
    postcode: params.postcode,
    propertyType: params.propertyType,
    bedrooms: params.bedrooms,
    soldInMonths: 18,
  }

  // Fetch both network sources in parallel; neither can break the other.
  const [apiSold, rightmove] = await Promise.all([
    (async () => {
      try {
        return (await (params.fetchSold ?? defaultFetchSold)(soldBody)).sales ?? []
      } catch {
        return [] as GdvComparable[]
      }
    })(),
    (async () => {
      try {
        return (await (params.fetchRightmove ?? defaultFetchRightmove)(soldBody)).listings ?? []
      } catch {
        return [] as GdvComparable[]
      }
    })(),
  ])

  // Land Registry (payload) + reliable sold route + Rightmove, de-duplicated.
  const allComps = deduplicateComps([...landReg, ...apiSold, ...rightmove])

  // For a development we proxy "refurbished/new-build" comps by keeping the
  // top of the £/m² distribution (or anything explicitly new-build).
  const medianPpm2 = areaMedianPricePerM2(allComps)
  const refurbishedComps = params.isNewBuild
    ? allComps.filter(
        (c) =>
          c.isNewBuild ||
          (c.floorSizeM2 && c.price && c.price / c.floorSizeM2 > medianPpm2 * 1.1),
      )
    : allComps

  // Sized comps for the £/m² benchmark. Prefer the refurbished subset, but if
  // that filter leaves nothing sized (e.g. comps are tightly clustered so none
  // clear the median×1.1 bar), fall back to ALL sized comps so we never lose
  // the £/m² figure entirely.
  let compsWithSize = refurbishedComps.filter((c) => c.floorSizeM2 && c.price > 0)
  if (compsWithSize.length === 0) {
    compsWithSize = allComps.filter((c) => c.floorSizeM2 && c.price > 0)
  }
  const ppm2Values = compsWithSize.map((c) => c.price / (c.floorSizeM2 as number))
  const avgPricePerM2 = ppm2Values.length
    ? Math.round(ppm2Values.reduce((s, v) => s + v, 0) / ppm2Values.length)
    : null

  // Three-tier ARV (only when we have floor area + sized comps).
  const sorted = [...ppm2Values].sort((a, b) => a - b)
  const size = params.floorSizeM2 ?? null
  const tier = (q: number): number | null =>
    sorted.length && size ? Math.round(sorted[Math.floor(sorted.length * q)] * size) : null

  const prices = allComps.map((c) => c.price).filter((p) => p > 0)
  const avgPrice = prices.length
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    : null
  const priceRange = prices.length
    ? { low: Math.min(...prices), high: Math.max(...prices) }
    : null

  return {
    conservativeARV: tier(0.25),
    midARV: avgPricePerM2 && size ? Math.round(avgPricePerM2 * size) : null,
    optimisticARV: tier(0.75),
    avgPrice,
    avgPricePerM2,
    priceRange,
    comparables: allComps,
    rightmoveComps: rightmove.length,
    landRegComps: landReg.length + apiSold.length,
    totalComps: allComps.length,
    methodology: buildMethodologyText(
      allComps.length,
      avgPricePerM2,
      params.postcode,
      params.isNewBuild ?? false,
    ),
  }
}
