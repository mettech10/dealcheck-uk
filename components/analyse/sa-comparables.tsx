"use client"

import { useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Star, TrendingUp, AlertTriangle, Search, BarChart3 } from "lucide-react"
import { formatCurrency } from "@/lib/calculations"

interface SAListing {
  title: string
  nightly_rate: number
  property_type: string
  bedrooms: number
  rating: number | null
  reviews: number
  url: string
  thumbnail: string | null
}

interface SASummary {
  count: number
  avg_nightly_rate: number
  min_nightly_rate: number
  max_nightly_rate: number
  avg_rating: number | null
  avg_reviews: number
  demand: "high" | "moderate" | "low"
  demand_label: string
}

// ── Airroi Types ──────────────────────────────────────────────────────────
interface AirroiMarket {
  marketId: string
  marketName: string
  avgNightlyRate: number
  avgOccupancyRate: number
  avgMonthlyRevenue: number
  revPAR: number
  avgLengthOfStay: number
  totalActiveListings: number
  dataSource: string
}

interface AirroiListing {
  listingId: string
  title: string
  nightlyRate: number
  bedrooms: number
  occupancyRate: number
  monthlyRevenue: number
  rating: number
  reviewCount: number
  listingUrl: string
  thumbnailUrl: string
  distance: number
}

interface SAComparablesProps {
  postcode: string
  bedrooms: number
}

export function SAComparables({ postcode, bedrooms }: SAComparablesProps) {
  const [listings, setListings] = useState<SAListing[]>([])
  const [summary, setSummary] = useState<SASummary | null>(null)
  const [fallbackUrl, setFallbackUrl] = useState("")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [airroiMarket, setAirroiMarket] = useState<AirroiMarket | null>(null)
  const [airroiListings, setAirroiListings] = useState<AirroiListing[]>([])

  const district = postcode.split(" ")[0] || postcode

  useEffect(() => {
    if (!postcode) return

    setLoading(true)
    fetch("/api/comparables/sa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcode, bedrooms }),
    })
      .then((r) => r.json())
      .then((data) => {
        setListings(data.listings || [])
        setSummary(data.summary || null)
        setFallbackUrl(
          data.fallback_url ||
            `https://www.airbnb.co.uk/s/${district}/homes?adults=2&min_bedrooms=${bedrooms}`
        )
        setMessage(data.message || "")
        // Airroi data (may be null if API unavailable)
        setAirroiMarket(data.airroiMarket || null)
        setAirroiListings(data.airroiListings || [])
      })
      .catch(() => {
        setFallbackUrl(
          `https://www.airbnb.co.uk/s/${district}/homes?adults=2&min_bedrooms=${bedrooms}`
        )
        setMessage("Could not fetch SA comparables")
      })
      .finally(() => setLoading(false))
  }, [postcode, bedrooms, district])

  const demandIcon =
    summary?.demand === "high" ? (
      <TrendingUp className="size-3.5 text-green-500" />
    ) : summary?.demand === "low" ? (
      <AlertTriangle className="size-3.5 text-amber-500" />
    ) : null

  return (
    <div className="space-y-4">
      {/* ── Airroi SA Market Data Card ──────────────────────────────────── */}
      {!loading && airroiMarket && airroiMarket.avgNightlyRate > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" />
              <CardTitle className="text-sm">
                SA Market Data — {airroiMarket.marketName || district}
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Source: Airroi · Airbnb
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Metrics table */}
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="divide-y divide-border/30">
                <MetricRow label="Avg Rate" value={`£${airroiMarket.avgNightlyRate.toFixed(0)}/night`} />
                <MetricRow label="Occupancy" value={`${airroiMarket.avgOccupancyRate.toFixed(0)}%`} />
                <MetricRow label="Monthly Rev" value={formatCurrency(airroiMarket.avgMonthlyRevenue)} />
                <MetricRow label="RevPAR" value={`£${airroiMarket.revPAR.toFixed(0)}`} />
                <MetricRow label="Stay Length" value={`${airroiMarket.avgLengthOfStay.toFixed(1)} nights`} />
                <MetricRow label="Listings" value={`${airroiMarket.totalActiveListings.toFixed(0)} active`} />
              </div>
            </div>

            {/* Airroi nearby listings */}
            {airroiListings.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Nearby SA Listings
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {airroiListings.map((al, i) => (
                    <a
                      key={i}
                      href={al.listingUrl || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex gap-3 rounded-lg border border-border/50 p-2.5 transition-colors hover:border-primary/30"
                    >
                      {/* Thumbnail */}
                      <div className="size-14 shrink-0 rounded-md overflow-hidden bg-muted/50 flex items-center justify-center">
                        {al.thumbnailUrl ? (
                          <img
                            src={al.thumbnailUrl}
                            alt=""
                            className="size-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none"
                            }}
                          />
                        ) : (
                          <Star className="size-5 text-muted-foreground/30" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-primary">
                          £{al.nightlyRate}/night
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {al.bedrooms > 0 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {al.bedrooms} bed
                            </Badge>
                          )}
                          {al.occupancyRate > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              Occ: {al.occupancyRate.toFixed(0)}%
                            </span>
                          )}
                        </div>
                        {al.rating > 0 && (
                          <span className="text-xs text-muted-foreground">
                            ★ {al.rating.toFixed(1)}
                            {al.reviewCount > 0 && ` (${al.reviewCount} reviews)`}
                          </span>
                        )}
                        {al.distance > 0 && (
                          <span className="text-[10px] text-muted-foreground ml-1">
                            · {al.distance.toFixed(1)}km away
                          </span>
                        )}
                      </div>
                      {al.listingUrl && (
                        <ExternalLink className="mt-1 size-3 shrink-0 text-muted-foreground/40" />
                      )}
                    </a>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  {airroiListings.length} SA comparables
                  {airroiListings.filter(l => l.nightlyRate > 0).length > 0 &&
                    ` · Avg: £${Math.round(airroiListings.filter(l => l.nightlyRate > 0).reduce((s, l) => s + l.nightlyRate, 0) / airroiListings.filter(l => l.nightlyRate > 0).length)}/night`}
                  {airroiListings.filter(l => l.occupancyRate > 0).length > 0 &&
                    ` · Avg occupancy: ${Math.round(airroiListings.filter(l => l.occupancyRate > 0).reduce((s, l) => s + l.occupancyRate, 0) / airroiListings.filter(l => l.occupancyRate > 0).length)}%`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Existing Airbnb Comparables Card ────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Star className="size-4 text-primary" />
            <CardTitle className="text-sm">
              Nightly Rate Comparables — {district}
            </CardTitle>
          </div>
          <CardDescription>
            Live Airbnb listings in this area for {bedrooms}-bedroom properties
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Searching Airbnb listings...
            </p>
          )}

          {!loading && listings.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-muted-foreground">
                {message || "No Airbnb listings found for this area."}
              </p>
              <p className="text-xs text-muted-foreground">
                The Airbnb actor requires a paid Apify subscription ($30/month).
              </p>
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-muted/50 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Search className="size-4" />
                Search Airbnb in this area
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </a>
            </div>
          )}

          {!loading && listings.length > 0 && (
            <>
              {/* Summary bar */}
              {summary && (
                <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                  <span>
                    <strong className="text-foreground">{summary.count}</strong>{" "}
                    comparables found
                  </span>
                  <span>
                    Avg:{" "}
                    <strong className="text-foreground">
                      £{summary.avg_nightly_rate}
                    </strong>
                    /night
                  </span>
                  <span>
                    Range: £{summary.min_nightly_rate}–£{summary.max_nightly_rate}
                  </span>
                  {summary.avg_rating && (
                    <span>
                      Avg rating:{" "}
                      <strong className="text-foreground">
                        ★{summary.avg_rating}
                      </strong>
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    {demandIcon}
                    <strong
                      className={
                        summary.demand === "high"
                          ? "text-green-500"
                          : summary.demand === "low"
                            ? "text-amber-500"
                            : "text-foreground"
                      }
                    >
                      {summary.demand_label}
                    </strong>
                  </span>
                </div>
              )}

              {/* Listings grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {listings.map((listing, i) => (
                  <a
                    key={i}
                    href={listing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex gap-3 rounded-lg border border-border/50 p-3 transition-colors hover:border-primary/30"
                  >
                    {listing.thumbnail && (
                      <img
                        src={listing.thumbnail}
                        alt=""
                        className="size-16 shrink-0 rounded-md object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-medium text-foreground leading-snug">
                        {listing.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-primary">
                          £{listing.nightly_rate}/night
                        </span>
                        {listing.rating && (
                          <span className="text-xs text-muted-foreground">
                            ★{listing.rating}
                            {listing.reviews > 0 && ` (${listing.reviews})`}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex gap-1.5">
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {listing.bedrooms} bed
                        </Badge>
                      </div>
                    </div>
                    <ExternalLink className="mt-1 size-3.5 shrink-0 text-muted-foreground/50" />
                  </a>
                ))}
              </div>

              {/* Fallback link */}
              <div className="mt-3 text-center">
                <a
                  href={fallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline hover:text-primary/80"
                >
                  View all Airbnb listings in {district} →
                </a>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Helper: Metric row for Airroi table ────────────────────────────────────
function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  )
}
