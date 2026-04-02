"use client"

import { useState, useEffect } from "react"
import { ExternalLink, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react"

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

interface HmoAnalysis {
  demand: "strong" | "moderate" | "weak"
  rentRange: string
  roomTypes: string
  patterns: string
  verdict: string
}

interface ManualSearchInfo {
  searchUrl: string
  message: string
}

interface HmoComparablesProps {
  postcode: string
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

function HmoSummaryLine({ listings }: { listings: RoomListing[] }) {
  const rents = listings
    .filter((l) => l.monthly_rent && l.monthly_rent > 0)
    .map((l) => l.monthly_rent!)
  if (rents.length === 0) return null
  const avg = Math.round(rents.reduce((a, b) => a + b, 0) / rents.length)
  const min = Math.min(...rents)
  const max = Math.max(...rents)
  return (
    <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border/30 mt-1">
      {listings.length} room{listings.length !== 1 ? "s" : ""} found
      {" · "}Average: £{avg.toLocaleString()} pcm
      {" · "}Range: £{min.toLocaleString()} – £{max.toLocaleString()} pcm
    </div>
  )
}

export function HmoComparables({ postcode }: HmoComparablesProps) {
  const [listings, setListings] = useState<RoomListing[]>([])
  const [analysis, setAnalysis] = useState<HmoAnalysis | null>(null)
  const [searchArea, setSearchArea] = useState<string>("")
  const [manualSearch, setManualSearch] = useState<ManualSearchInfo | null>(null)
  const [loadingListings, setLoadingListings] = useState(true)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      setLoadingListings(true)
      setError(null)

      try {
        console.log("[HMO] SPAREROOM CALL TRIGGERED - postcode:", postcode)
        const spareRoomPayload = { postcode, maxResults: 12 }
        console.log("[HMO] SPAREROOM INPUT PAYLOAD:", JSON.stringify(spareRoomPayload, null, 2))

        const res = await fetch("/api/comparables/spareroom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(spareRoomPayload),
        })
        console.log("[HMO] SPAREROOM RESPONSE STATUS:", res.status)
        const data = await res.json()
        console.log("[HMO] SPAREROOM RAW RESPONSE:", JSON.stringify(data, null, 2))
        if (cancelled) return

        if (!data.success) {
          console.log("[HMO] SPAREROOM FAILED:", data.message)
          setError(data.message || "Unable to fetch room listing data. Please try again.")
          setLoadingListings(false)
          return
        }

        // Normalize listing fields from either OpenRent or SpareRoom format
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
          source: (l.source as string) || data.source || "unknown",
        }))
        const area = data.searchArea || postcode.split(" ")[0] || postcode
        const dataSource = data.source || "unknown"
        console.log("[HMO] RESULTS:", fetchedListings.length, "source:", dataSource, "searchArea:", area, "manualSearch:", data.manualSearch)
        if (fetchedListings.length > 0) {
          console.log("[HMO] SPAREROOM FIRST RESULT:", JSON.stringify(fetchedListings[0], null, 2))
        }
        setListings(fetchedListings)
        setSearchArea(area)
        setLoadingListings(false)

        // If backend returned a manual search fallback, show that instead
        if (data.manualSearch && data.searchUrl) {
          setManualSearch({ searchUrl: data.searchUrl, message: data.message || "" })
          return
        }

        if (fetchedListings.length === 0) return

        // Run HMO area analysis
        setLoadingAnalysis(true)
        console.log("[HMO] HMO-ANALYSIS CALL - postcode:", postcode, "listings count:", fetchedListings.length)
        const aiRes = await fetch("/api/comparables/hmo-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postcode, listings: fetchedListings }),
        })
        const aiData = await aiRes.json()
        console.log("[HMO] HMO-ANALYSIS RESPONSE:", JSON.stringify(aiData, null, 2).slice(0, 500))
        if (cancelled) return

        if (aiData.success && aiData.analysis) {
          setAnalysis(aiData.analysis)
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        const errStack = err instanceof Error ? err.stack : ""
        console.log("[HMO] ERROR TRIGGERED:", errMsg, errStack)
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
  }, [postcode])

  if (loadingListings) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3 py-8">
          <Loader2 className="size-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Fetching live room listings near {postcode}…</p>
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

  return (
    <div className="flex flex-col gap-6">
      {/* ── Rental Comparables ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-base font-semibold text-foreground">
            Rental Comparables — {searchArea || postcode.split(" ")[0]} area
          </h3>
          <span className="text-xs text-muted-foreground">
            Live room listings · searching {searchArea || postcode.split(" ")[0]}
          </span>
        </div>

        {manualSearch ? (
          <div className="rounded-xl border border-border/50 bg-card p-5 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              SpareRoom data is temporarily unavailable for automated retrieval.
              Use the link below to search for HMO room listings near{" "}
              <span className="font-medium text-foreground">{searchArea || postcode.split(" ")[0]}</span> directly on SpareRoom.
            </p>
            <a
              href={manualSearch.searchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors px-4 py-2.5 text-sm font-medium w-fit"
            >
              Search SpareRoom for rooms near {searchArea || postcode.split(" ")[0]}
              <ExternalLink className="size-4" />
            </a>
            <p className="text-xs text-muted-foreground">
              Tip: Check how many rooms are available and at what price to gauge HMO demand in this area.
            </p>
          </div>
        ) : listings.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No room listings found in the {searchArea || postcode.split(" ")[0]} area.
            This may indicate low HMO demand in this location.
          </p>
        ) : (
          <>
            <div className="flex flex-col divide-y divide-border/50 rounded-xl border border-border/50 overflow-hidden">
              {listings.map((lst, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors">
                  {/* Thumbnail */}
                  {lst.image_url && (
                    <div className="shrink-0 w-16 h-12 rounded overflow-hidden bg-muted">
                      <img
                        src={lst.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}

                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <p className="text-sm font-medium text-foreground truncate">{lst.title}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{lst.postcode || lst.address}</span>
                      {lst.distance_km != null && (
                        <span>{lst.distance_km}km away</span>
                      )}
                      {lst.room_type && lst.room_type !== "Unknown" && (
                        <span className="text-[10px] rounded bg-primary/10 text-primary px-1.5 py-0.5">{lst.room_type}</span>
                      )}
                      {lst.bills_included === "Yes" && (
                        <span className="text-[10px] rounded bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5">Bills incl.</span>
                      )}
                      {lst.available_from && lst.available_from !== "Now" && (
                        <span>· Available {lst.available_from}</span>
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
                      <a
                        href={lst.listing_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        View <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary line */}
            <HmoSummaryLine listings={listings} />
          </>
        )}
      </div>

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
                  <p className="text-xs text-muted-foreground mb-0.5">Common Room Types</p>
                  <p className="font-medium text-foreground">{analysis.roomTypes}</p>
                </div>
              </div>
              {analysis.patterns && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notable Patterns</p>
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
