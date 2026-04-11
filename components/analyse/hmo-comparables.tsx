"use client"

import { useState, useEffect } from "react"
import { ExternalLink, Loader2, TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react"

interface RoomListing {
  title: string
  address: string
  postcode: string
  monthly_rent: number | null
  bills_included: string
  num_rooms: number | null
  room_type: string
  available_from: string
  listing_url: string
  image_url?: string
  distance_km?: number | null
  source?: string
}

export interface RoomSummary {
  roomType: string
  avgWeekly: number
  avgMonthly: number
  range70: [number, number]
  range100: [number, number]
  count: number
  radius: string
}

/** Aggregate HMO room rent data lifted to parent for the House Valuation card */
export interface HmoLoadedData {
  roomSummaries: RoomSummary[]
  /** Average monthly rent across all room types found */
  avgMonthlyRoomRent: number
  /** Total data points across all room types */
  totalDataPoints: number
  /** District searched (e.g. "M1") */
  searchArea: string
}

interface HmoAnalysis {
  demand: "strong" | "moderate" | "weak"
  rentRange: string
  roomTypes: string
  patterns: string
  verdict: string
}

interface ManualSearchInfo {
  searchUrl: string
  openrentUrl?: string
  message: string
}

interface HmoComparablesProps {
  postcode: string
  /** Lift loaded HMO room rent data to parent for use in the House Valuation card */
  onDataLoaded?: (data: HmoLoadedData) => void
}

const DEMAND_CONFIG = {
  strong: { label: "Strong HMO Demand", icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  moderate: { label: "Moderate HMO Demand", icon: Minus, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  weak: { label: "Weak HMO Demand", icon: TrendingDown, color: "text-red-600", bg: "bg-red-50 border-red-200" },
}

function DemandBadge({ demand }: { demand: "strong" | "moderate" | "weak" }) {
  const cfg = DEMAND_CONFIG[demand] || DEMAND_CONFIG.moderate
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${cfg.color} ${cfg.bg}`}>
      <Icon className="size-4" />
      {cfg.label}
    </span>
  )
}

/** Derive demand from PropertyData stats */
function deriveDemand(summaries: RoomSummary[]): "strong" | "moderate" | "weak" {
  if (summaries.length === 0) return "weak"
  // Strong: 4 room types found with tight radius (< 1km avg)
  const avgRadius = summaries.reduce((s, r) => s + parseFloat(r.radius), 0) / summaries.length
  const totalPoints = summaries.reduce((s, r) => s + r.count, 0)
  if (summaries.length >= 4 && avgRadius < 1.0) return "strong"
  if (summaries.length >= 3 && avgRadius < 2.0) return "moderate"
  if (totalPoints >= 40) return "moderate"
  return "weak"
}

/** Weekly to monthly for display */
function wkToMo(weekly: number): number {
  return Math.round((weekly * 52) / 12)
}

export function HmoComparables({ postcode, onDataLoaded }: HmoComparablesProps) {
  const [listings, setListings] = useState<RoomListing[]>([])
  const [roomSummaries, setRoomSummaries] = useState<RoomSummary[]>([])
  const [analysis, setAnalysis] = useState<HmoAnalysis | null>(null)
  const [searchArea, setSearchArea] = useState<string>("")
  const [manualSearch, setManualSearch] = useState<ManualSearchInfo | null>(null)
  const [dataSource, setDataSource] = useState<string>("unknown")
  const [loadingListings, setLoadingListings] = useState(true)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      setLoadingListings(true)
      setError(null)

      try {
        console.log("[HMO] Fetching HMO data - postcode:", postcode)

        const res = await fetch("/api/comparables/spareroom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postcode, maxResults: 20 }),
        })
        const data = await res.json()
        if (cancelled) return

        if (!data.success) {
          setError(data.message || "Unable to fetch room listing data.")
          setLoadingListings(false)
          return
        }

        const source = data.source || "unknown"
        setDataSource(source)
        const area = data.searchArea || postcode.split(" ")[0] || postcode
        setSearchArea(area)

        // PropertyData returns roomSummaries (structured averages by room type)
        if (data.roomSummaries && data.roomSummaries.length > 0) {
          setRoomSummaries(data.roomSummaries)
          console.log("[HMO] PropertyData room summaries:", data.roomSummaries.length, "types")

          // Lift to parent for House Valuation card
          if (onDataLoaded) {
            const summaries = data.roomSummaries as RoomSummary[]
            const totalPoints = summaries.reduce((s, r) => s + r.count, 0)
            const avgMonthlyRoomRent = summaries.length > 0
              ? Math.round(summaries.reduce((s, r) => s + r.avgMonthly, 0) / summaries.length)
              : 0
            onDataLoaded({
              roomSummaries: summaries,
              avgMonthlyRoomRent,
              totalDataPoints: totalPoints,
              searchArea: area,
            })
          }

          // Also set listings for backwards compat
          const rawListings = (data.listings || []).map((l: Record<string, unknown>) => ({
            title: (l.title as string) || "Room to rent",
            address: (l.address as string) || (l.postcode as string) || "",
            postcode: (l.postcode as string) || "",
            monthly_rent: (l.monthly_rent as number) ?? null,
            bills_included: (l.bills_included as string) || "Unknown",
            num_rooms: null,
            room_type: (l.room_type as string) || "Unknown",
            available_from: "Now",
            listing_url: (l.listing_url as string) || "",
            image_url: "",
            distance_km: (l.distance_km as number) ?? null,
            source: "propertydata",
          }))
          setListings(rawListings)
          setLoadingListings(false)

          // Build analysis from PropertyData stats (no AI call needed)
          const demand = deriveDemand(data.roomSummaries)
          const rents = data.roomSummaries.map((r: RoomSummary) => r.avgMonthly)
          const minRent = Math.min(...rents)
          const maxRent = Math.max(...rents)
          const types = data.roomSummaries.map((r: RoomSummary) => r.roomType).join(", ")
          const totalPoints = data.roomSummaries.reduce((s: number, r: RoomSummary) => s + r.count, 0)

          setAnalysis({
            demand,
            rentRange: `£${minRent} – £${maxRent} pcm`,
            roomTypes: types,
            patterns: `${totalPoints} data points analysed across ${data.roomSummaries.length} room types. ` +
              (data.hmoAttributes?.bills_inc
                ? `${data.hmoAttributes.bills_inc}% of rooms include bills. `
                : "") +
              (data.hmoAttributes?.furnished
                ? `${data.hmoAttributes.furnished}% are furnished.`
                : ""),
            verdict: demand === "strong"
              ? "Strong HMO market with good availability of data. Room rents are well-established in this area."
              : demand === "moderate"
                ? "Moderate HMO activity. Sufficient data to support investment decisions but check local Article 4 restrictions."
                : "Limited HMO data in this area. Consider whether demand supports an HMO conversion.",
          })
          return
        }

        // If backend returned a manual search fallback
        if (data.manualSearch && data.searchUrl) {
          setManualSearch({
            searchUrl: data.searchUrl,
            openrentUrl: data.openrentUrl || "",
            message: data.message || "",
          })
          setLoadingListings(false)
          return
        }

        // Legacy path: individual listings from SpareRoom/OpenRent actors
        const rawListings = data.listings || []
        const fetchedListings: RoomListing[] = rawListings.map((l: Record<string, unknown>) => ({
          title: (l.title as string) || (l.ad_title as string) || "Room to rent",
          address: (l.area as string) || (l.address as string) || (l.postcode as string) || "",
          postcode: (l.area as string) || (l.postcode as string) || "",
          monthly_rent: (l.rentPcm as number) ?? (l.monthly_rent as number) ?? null,
          bills_included: l.billsIncluded === true ? "Yes" : l.billsIncluded === false ? "No" : (l.bills_included as string) || "Unknown",
          num_rooms: (l.num_rooms as number) ?? null,
          room_type: (l.roomType as string) || (l.room_type as string) || "Unknown",
          available_from: (l.available_from as string) || "Now",
          listing_url: (l.listingUrl as string) || (l.listing_url as string) || "",
          image_url: (l.imageUrl as string) || (l.image_url as string) || "",
          distance_km: (l.distanceKm as number) ?? null,
          source: (l.source as string) || source,
        }))
        setListings(fetchedListings)
        setLoadingListings(false)

        if (fetchedListings.length === 0) return

        // Run HMO area analysis via AI
        setLoadingAnalysis(true)
        const aiRes = await fetch("/api/comparables/hmo-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postcode, listings: fetchedListings }),
        })
        const aiData = await aiRes.json()
        if (cancelled) return

        if (aiData.success && aiData.analysis) {
          setAnalysis(aiData.analysis)
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error("[HMO] ERROR:", errMsg)
        if (!cancelled) setError("Unable to fetch room listing data. Please try again.")
      } finally {
        if (!cancelled) {
          setLoadingListings(false)
          setLoadingAnalysis(false)
        }
      }
    }

    fetchData()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcode])

  if (loadingListings) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3 py-8">
          <Loader2 className="size-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Fetching HMO room data near {postcode}…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    )
  }

  const district = (searchArea || postcode.split(" ")[0]).toLowerCase()

  return (
    <div className="flex flex-col gap-6">
      {/* ── Room Rent Summaries (PropertyData) ──────────────────────────── */}
      {roomSummaries.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-foreground">
              HMO Room Rents — {searchArea || postcode.split(" ")[0]}
            </h3>
            <span className="text-xs text-muted-foreground">
              PropertyData · UK Rental Market Data
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {roomSummaries.map((room) => (
              <div
                key={room.roomType}
                className="rounded-xl border border-border/50 bg-card p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{room.roomType}</span>
                  <span className="text-[10px] rounded bg-primary/10 text-primary px-1.5 py-0.5">
                    {room.count} data points
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-foreground">£{room.avgMonthly}</span>
                  <span className="text-xs text-muted-foreground">pcm avg</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  70% range: £{wkToMo(room.range70[0])} – £{wkToMo(room.range70[1])} pcm
                </div>
                <div className="text-xs text-muted-foreground">
                  Full range: £{wkToMo(room.range100[0])} – £{wkToMo(room.range100[1])} pcm
                </div>
                <div className="text-[10px] text-muted-foreground/70">
                  {room.radius}km search radius
                </div>
              </div>
            ))}
          </div>

          {/* Browse live link */}
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={`https://www.spareroom.co.uk/flatshare/${district}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              Browse live HMO rooms on SpareRoom <ExternalLink className="size-3" />
            </a>
            <a
              href={`https://www.openrent.co.uk/properties-to-rent/${district}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              OpenRent <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      )}

      {/* ── Individual Listings (legacy SpareRoom/OpenRent or PropertyData samples) */}
      {roomSummaries.length === 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-foreground">
              Rental Comparables — {searchArea || postcode.split(" ")[0]} area
            </h3>
            <span className="text-xs text-muted-foreground">
              {dataSource === "propertydata" ? "PropertyData" : "Live room listings"} · {searchArea || postcode.split(" ")[0]}
            </span>
          </div>

          {manualSearch ? (
            <div className="rounded-xl border border-border/50 bg-card p-5 flex flex-col gap-3">
              <p className="text-sm text-muted-foreground leading-relaxed">
                No automated room listing data available for{" "}
                <span className="font-medium text-foreground">{searchArea || postcode.split(" ")[0]}</span>.
                Search manually on SpareRoom or OpenRent to gauge HMO demand.
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={manualSearch.searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors px-4 py-2.5 text-sm font-medium"
                >
                  Search SpareRoom <ExternalLink className="size-4" />
                </a>
                {manualSearch.openrentUrl && (
                  <a
                    href={manualSearch.openrentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-muted/50 text-foreground hover:bg-muted transition-colors px-4 py-2.5 text-sm font-medium"
                  >
                    Search OpenRent <ExternalLink className="size-4" />
                  </a>
                )}
              </div>
            </div>
          ) : listings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No room listings found in the {searchArea || postcode.split(" ")[0]} area.
            </p>
          ) : (
            <>
              <div className="flex flex-col divide-y divide-border/50 rounded-xl border border-border/50 overflow-hidden">
                {listings.map((lst, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors">
                    {lst.image_url && (
                      <div className="shrink-0 w-16 h-12 rounded overflow-hidden bg-muted">
                        <img src={lst.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <p className="text-sm font-medium text-foreground truncate">{lst.title}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{lst.postcode || lst.address}</span>
                        {lst.distance_km != null && <span>{lst.distance_km}km away</span>}
                        {lst.room_type && lst.room_type !== "Unknown" && (
                          <span className="text-[10px] rounded bg-primary/10 text-primary px-1.5 py-0.5">{lst.room_type}</span>
                        )}
                        {lst.bills_included === "Yes" && (
                          <span className="text-[10px] rounded bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5">Bills incl.</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {lst.monthly_rent ? (
                        <span className="text-sm font-semibold text-foreground">£{lst.monthly_rent.toLocaleString()} pcm</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">POA</span>
                      )}
                      {lst.listing_url && (
                        <a href={lst.listing_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                          View <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Area HMO Analysis ──────────────────────────────────────────── */}
      {(analysis || loadingAnalysis) && (
        <div className="flex flex-col gap-4 rounded-xl border border-border/50 bg-card p-5">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-base font-semibold text-foreground">Area HMO Analysis</h3>
            {loadingAnalysis && !analysis && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Analysing…
              </span>
            )}
            {analysis && <DemandBadge demand={analysis.demand} />}
          </div>

          {analysis && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-0.5">Typical Rent Range</p>
                  <p className="font-medium text-foreground">{analysis.rentRange}</p>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-0.5">Room Types Available</p>
                  <p className="font-medium text-foreground">{analysis.roomTypes}</p>
                </div>
              </div>
              {analysis.patterns && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Market Insights</p>
                  <p className="text-muted-foreground leading-relaxed">{analysis.patterns}</p>
                </div>
              )}
              {analysis.verdict && (
                <div className="border-t border-border/50 pt-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Overall Verdict</p>
                  <p className="text-foreground leading-relaxed">{analysis.verdict}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
