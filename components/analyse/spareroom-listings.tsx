"use client"

import { useState, useEffect } from "react"
import { ExternalLink, Loader2, Home } from "lucide-react"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://metusa-deal-analyzer.onrender.com"

interface SpareRoomListing {
  title: string
  rentPcm: number | null
  roomType: string
  billsIncluded: boolean | null
  area: string
  distanceKm: number | null
  listingUrl: string
  imageUrl: string
  source: string
  // Additional fields from live scraper
  listing_url?: string
  image_url?: string
  thumbnailUrl?: string
  monthly_rent?: number
  price_pcm?: number
}

interface SpareRoomListingsProps {
  postcode: string
}

export function SpareRoomListings({ postcode }: SpareRoomListingsProps) {
  const [listings, setListings] = useState<SpareRoomListing[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState("")
  const [searchUrl, setSearchUrl] = useState("")

  const district = postcode.split(" ")[0] || postcode

  useEffect(() => {
    if (!postcode) return

    setLoading(true)

    // Call Flask backend directly for live SpareRoom scraped data
    fetch(`${BACKEND_URL}/api/comparables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcode: postcode.toUpperCase(), maxResults: 12 }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setListings(data.listings || [])
          setSource(data.source || "")
          setSearchUrl(data.searchUrl || `https://www.spareroom.co.uk/flatshare/?search_by=postcode&search=${encodeURIComponent(postcode)}`)
        }
      })
      .catch((err) => {
        console.error("[SpareRoom Listings] Error:", err)
      })
      .finally(() => setLoading(false))
  }, [postcode])

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8">
        <Loader2 className="size-5 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Fetching live room listings near {postcode}…</p>
      </div>
    )
  }

  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Home className="size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No live room listings found for {district}.
        </p>
        {searchUrl && (
          <a
            href={searchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-muted/50 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Search SpareRoom manually
            <ExternalLink className="size-3.5 text-muted-foreground" />
          </a>
        )}
      </div>
    )
  }

  // Calculate summary
  const rents = listings.filter((l) => getRent(l) > 0).map((l) => getRent(l))
  const avgRent = rents.length > 0 ? Math.round(rents.reduce((a, b) => a + b, 0) / rents.length) : 0

  return (
    <div className="flex flex-col gap-3">
      {/* Source badge */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {listings.length} room{listings.length !== 1 ? "s" : ""} found
          {avgRent > 0 && ` · Avg: £${avgRent} pcm`}
          {source && ` · Source: ${source}`}
        </p>
      </div>

      {/* Listing cards */}
      <div className="flex flex-col divide-y divide-border/50 rounded-xl border border-border/50 overflow-hidden">
        {listings.map((lst, i) => {
          const rent = getRent(lst)
          const url = lst.listingUrl || lst.listing_url || ""
          const img = lst.imageUrl || lst.image_url || lst.thumbnailUrl || ""

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
                      {lst.area || lst.title || district}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {lst.roomType && lst.roomType !== "Unknown" && (
                        <span className="text-[10px] rounded bg-primary/10 text-primary px-1.5 py-0.5">
                          {lst.roomType}
                        </span>
                      )}
                      {lst.billsIncluded === true && (
                        <span className="text-[10px] rounded bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5">
                          Bills incl.
                        </span>
                      )}
                      {lst.distanceKm != null && lst.distanceKm > 0 && (
                        <span className="text-[10px] rounded bg-muted text-muted-foreground px-1.5 py-0.5">
                          {lst.distanceKm.toFixed(1)}km
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
                      title="View listing"
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

      {/* Browse link */}
      {searchUrl && (
        <div className="text-center pt-1">
          <a
            href={searchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            Browse all rooms on SpareRoom in {district} →
          </a>
        </div>
      )}
    </div>
  )
}

/** Extract rent from various field name patterns */
function getRent(l: SpareRoomListing): number {
  return l.rentPcm || l.monthly_rent || l.price_pcm || 0
}
