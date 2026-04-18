"use client"

import { useState, useEffect } from "react"
import { ExternalLink, Loader2, Home } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────

interface RoomListing {
  title?: string
  rentPcm?: number | null
  monthly_rent?: number | null
  roomType?: string
  room_type?: string
  billsIncluded?: boolean | string | null
  bills_included?: string | null
  area?: string
  address?: string
  distanceKm?: number | null
  distance_km?: number | null
  listingUrl?: string
  listing_url?: string
  imageUrl?: string
  image_url?: string
  thumbnailUrl?: string
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

interface SpareRoomListingsProps {
  postcode: string
}

function getRent(l: RoomListing): number {
  return l.rentPcm || l.monthly_rent || 0
}

function getUrl(l: RoomListing): string {
  return l.listingUrl || l.listing_url || ""
}

function getImg(l: RoomListing): string {
  return l.imageUrl || l.image_url || l.thumbnailUrl || ""
}

function getRoomType(l: RoomListing): string {
  return l.roomType || l.room_type || ""
}

function getBillsIncluded(l: RoomListing): boolean {
  if (l.billsIncluded === true || l.bills_included === "Yes") return true
  return false
}

// ── Component ─────────────────────────────────────────────────────────────

export function SpareRoomListings({ postcode }: SpareRoomListingsProps) {
  const [listings, setListings] = useState<RoomListing[]>([])
  const [roomSummaries, setRoomSummaries] = useState<RoomSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState("")
  const [searchUrl, setSearchUrl] = useState("")
  const [isManual, setIsManual] = useState(false)

  const district = postcode.split(" ")[0] || postcode
  const fallbackSearchUrl = `https://www.spareroom.co.uk/flatshare/?search_by=postcode&search=${encodeURIComponent(postcode)}&miles_from_max=2&rooms_for=0&rooms_offered=1`

  useEffect(() => {
    if (!postcode) return
    setLoading(true)

    // Call the Next.js route — it has PropertyData (working) + Flask SpareRoom fallback
    fetch("/api/comparables/spareroom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcode: postcode.toUpperCase(), maxResults: 12 }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setListings(data.listings || [])
          setRoomSummaries(data.roomSummaries || [])
          setSource(data.source || "")
          setSearchUrl(data.searchUrl || fallbackSearchUrl)
          setIsManual(!!data.manualSearch)
        } else {
          setSearchUrl(fallbackSearchUrl)
        }
      })
      .catch(() => {
        setSearchUrl(fallbackSearchUrl)
      })
      .finally(() => setLoading(false))
  }, [postcode, fallbackSearchUrl])

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8">
        <Loader2 className="size-5 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Fetching room listings near {postcode}…</p>
      </div>
    )
  }

  // ── PropertyData room summaries (market averages) ────────────────────────
  if (roomSummaries.length > 0) {
    const liveListings = listings.filter(l => getUrl(l))
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          PropertyData market averages · {district}
          {liveListings.length > 0 && ` · ${liveListings.length} live listing${liveListings.length !== 1 ? "s" : ""}`}
        </p>

        {/* Room average cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {roomSummaries.map((room) => (
            <div
              key={room.roomType}
              className="rounded-xl border border-border/50 bg-card p-4 flex flex-col gap-1.5"
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
                70% range: £{Math.round(room.range70[0] * 52 / 12)} – £{Math.round(room.range70[1] * 52 / 12)} pcm
              </div>
            </div>
          ))}
        </div>

        {/* Live SpareRoom listings on top of PropertyData (if scraper also returned some) */}
        {liveListings.length > 0 && (
          <>
            <p className="text-xs font-medium text-muted-foreground mt-1">Live SpareRoom listings</p>
            <LiveListingCards listings={liveListings} district={district} />
          </>
        )}

        {/* SpareRoom browse link */}
        <div className="text-center pt-1">
          <a
            href={searchUrl || fallbackSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            Browse live rooms on SpareRoom in {district} →
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
    )
  }

  // ── Live SpareRoom listings (scraper returned data) ──────────────────────
  const liveListings = listings.filter(l => getUrl(l))
  if (liveListings.length > 0) {
    const rents = liveListings.filter(l => getRent(l) > 0).map(l => getRent(l))
    const avgRent = rents.length > 0 ? Math.round(rents.reduce((a, b) => a + b, 0) / rents.length) : 0
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {liveListings.length} live listing{liveListings.length !== 1 ? "s" : ""}
          {avgRent > 0 && ` · Avg: £${avgRent} pcm`}
          {" · SpareRoom"}
        </p>
        <LiveListingCards listings={liveListings} district={district} />
        <div className="text-center pt-1">
          <a
            href={searchUrl || fallbackSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            Browse all rooms on SpareRoom in {district} →
          </a>
        </div>
      </div>
    )
  }

  // ── Empty state (no live listings, no PropertyData) ──────────────────────
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Home className="size-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        No live SpareRoom listings found for {district} right now.
      </p>
      <p className="text-xs text-muted-foreground">
        See HMO Room Rents below for PropertyData market averages.
      </p>
      <a
        href={searchUrl || fallbackSearchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-muted/50 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        Search SpareRoom in {district}
        <ExternalLink className="size-3.5 text-muted-foreground" />
      </a>
    </div>
  )
}

// ── Live listing cards sub-component ──────────────────────────────────────
function LiveListingCards({ listings, district }: { listings: RoomListing[]; district: string }) {
  return (
    <div className="flex flex-col divide-y divide-border/50 rounded-xl border border-border/50 overflow-hidden">
      {listings.map((lst, i) => {
        const rent = getRent(lst)
        const url = getUrl(lst)
        const img = getImg(lst)
        const roomType = getRoomType(lst)
        const billsInc = getBillsIncluded(lst)

        return (
          <div
            key={i}
            className="flex items-start gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
          >
            {/* Photo */}
            <div className="shrink-0 w-20 h-[60px] rounded-md overflow-hidden bg-muted/50 flex items-center justify-center">
              {img ? (
                <img
                  src={img}
                  alt="Room"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = "none"
                  }}
                />
              ) : (
                <Home className="size-5 text-muted-foreground/30" />
              )}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {rent > 0 && (
                    <p className="text-sm font-bold text-foreground">
                      £{rent.toLocaleString()} pcm
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground truncate">
                    {lst.area || lst.address || lst.title || district}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {roomType && roomType !== "Unknown" && (
                      <span className="text-[10px] rounded bg-primary/10 text-primary px-1.5 py-0.5">
                        {roomType}
                      </span>
                    )}
                    {billsInc && (
                      <span className="text-[10px] rounded bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5">
                        Bills incl.
                      </span>
                    )}
                    {(lst.distanceKm ?? lst.distance_km ?? null) != null && (lst.distanceKm || lst.distance_km)! > 0 && (
                      <span className="text-[10px] rounded bg-muted text-muted-foreground px-1.5 py-0.5">
                        {(lst.distanceKm || lst.distance_km)!.toFixed(1)}km
                      </span>
                    )}
                  </div>
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-primary hover:text-primary/80"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline mt-1"
                >
                  View room on SpareRoom →
                </a>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
