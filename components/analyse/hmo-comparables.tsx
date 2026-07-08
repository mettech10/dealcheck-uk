"use client"

import { useState, useEffect } from "react"
import { ExternalLink, Loader2, RotateCcw } from "lucide-react"
import { useLoadingTracker } from "@/lib/useLoadingTracker"

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

interface RoomSummary {
  roomType: string
  avgWeekly: number
  avgMonthly: number
  range70: [number, number]
  range100: [number, number]
  count: number
  radius: string
}

interface ManualSearchInfo {
  searchUrl: string
  openrentUrl?: string
  message: string
}

interface HmoComparablesProps {
  postcode: string
}

/** Weekly to monthly for display */
function wkToMo(weekly: number): number {
  return Math.round((weekly * 52) / 12)
}

export function HmoComparables({ postcode }: HmoComparablesProps) {
  const [listings, setListings] = useState<RoomListing[]>([])
  const [roomSummaries, setRoomSummaries] = useState<RoomSummary[]>([])
  const [searchArea, setSearchArea] = useState<string>("")
  const [manualSearch, setManualSearch] = useState<ManualSearchInfo | null>(null)
  const [dataSource, setDataSource] = useState<string>("unknown")
  const [loadingListings, setLoadingListings] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Manual retry counter — bumping it re-runs fetchData. Lives
  // outside the loading-tracker dep so a retry can't re-block the
  // full-page overlay.
  const [retryNonce, setRetryNonce] = useState(0)
  const { markDone } = useLoadingTracker()

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      setLoadingListings(true)
      setError(null)
      // Reset prior-attempt state so a retry can flip from
      // manual-search fallback → fresh listings without stale UI.
      setManualSearch(null)
      setListings([])
      setRoomSummaries([])

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

          // Area commentary now lives solely in the AI Area Analysis card
          // on the results page — no per-component analysis here.
          return
        }

        // ── LISTINGS FIRST ──────────────────────────────────────────
        // The backend sometimes returns BOTH a listings array AND a
        // manualSearch fallback URL (e.g. SpareRoom scraper got
        // some rooms but the count is below the comfort threshold).
        // Previously we checked manualSearch before listings, so any
        // response carrying both would render "No automated room
        // listing data" even though the SpareRoomListings card
        // above happily displayed the same listings — the two
        // cards must mirror each other since they're driven by the
        // same /api/comparables/spareroom payload.
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

        if (fetchedListings.length > 0) {
          setListings(fetchedListings)
          setLoadingListings(false)
        } else if (data.manualSearch && data.searchUrl) {
          // No live listings at all — fall back to manual-search UI.
          setManualSearch({
            searchUrl: data.searchUrl,
            openrentUrl: data.openrentUrl || "",
            message: data.message || "",
          })
          setLoadingListings(false)
          return
        } else {
          setListings([])
          setLoadingListings(false)
        }

        // The old per-component "Area HMO Analysis" AI call was removed —
        // the strategy-aware AI Area Analysis card covers area commentary.
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error("[HMO] ERROR:", errMsg)
        if (!cancelled) setError("Unable to fetch room listing data. Please try again.")
      } finally {
        if (!cancelled) {
          setLoadingListings(false)
        }
        markDone("spareRoom")
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [postcode, markDone, retryNonce])

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
                <button
                  type="button"
                  onClick={() => setRetryNonce((n) => n + 1)}
                  className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
                >
                  <RotateCcw className="size-4" />
                  Try again
                </button>
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
            <div className="flex flex-col items-start gap-3 py-2">
              <p className="text-sm text-muted-foreground">
                No room listings found in the {searchArea || postcode.split(" ")[0]} area.
              </p>
              <button
                type="button"
                onClick={() => setRetryNonce((n) => n + 1)}
                className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
              >
                <RotateCcw className="size-4" />
                Try again
              </button>
            </div>
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

      {/* "Area HMO Analysis" removed — area commentary renders once, in the
          strategy-aware AI Area Analysis card on the results page. */}
    </div>
  )
}
