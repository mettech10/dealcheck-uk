"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/calculations"
import { Home, PoundSterling, TrendingUp, MapPin, ExternalLink } from "lucide-react"

// ── Sold Comparables Types ────────────────────────────────────────────────
interface ComparableSale {
  price: number
  date: string
  street: string
  town?: string
  propertyType?: string
  tenure?: string
}

interface SoldData {
  sales: ComparableSale[]
  average: number
  count: number
  radiusMiles?: number
}

// ── Rental Comparables Types ──────────────────────────────────────────────
interface RentalListing {
  address: string
  monthlyRent: number
  rentLabel?: string | null
  bedrooms?: number
  propertyType: string
  imageUrl?: string
  listingUrl?: string
  agent?: string
  addedOn?: string
  priceFrequency?: string
}

interface RentalData {
  listings: RentalListing[]
  count: number
  averageRent: number
  minRent: number
  maxRent: number
  message?: string
}

// ── Rental Estimate (legacy PropertyData) ─────────────────────────────────
interface RentalEstimate {
  monthly: number
  confidence: string
  range?: { low: number; high: number }
}

// ── Props ─────────────────────────────────────────────────────────────────
interface PropertyComparablesProps {
  postcode: string
  bedrooms: number
  currentPrice?: number
  propertyType?: string
  propertyTypeDetail?: string
  tenureType?: string
  investmentType?: string
}

// Strategies that should show rental comparables
const RENTAL_STRATEGIES = new Set(["btl", "brr", "r2sa", "development"])

export function PropertyComparables({
  postcode,
  bedrooms,
  currentPrice,
  propertyType,
  propertyTypeDetail,
  tenureType,
  investmentType,
}: PropertyComparablesProps) {
  const [soldData, setSoldData] = useState<SoldData | null>(null)
  const [rentalEstimate, setRentalEstimate] = useState<RentalEstimate | null>(null)
  const [rentalListings, setRentalListings] = useState<RentalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [rentalLoading, setRentalLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"sold" | "rental">("sold")
  const [error, setError] = useState<string | null>(null)

  const showRentals = RENTAL_STRATEGIES.has(investmentType || "btl")

  // Fetch sold comparables + rental estimate
  useEffect(() => {
    async function fetchComparables() {
      if (!postcode) return
      setLoading(true)
      setError(null)

      try {
        const [soldRes, rentalRes] = await Promise.all([
          fetch("/api/comparables/sold", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              postcode,
              bedrooms,
              ...(propertyTypeDetail ? { propertyTypeDetail } : {}),
              ...(propertyType ? { propertyType } : {}),
              ...(tenureType ? { tenureType } : {}),
            }),
          }),
          fetch("/api/comparables/rental", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ postcode, bedrooms }),
          }),
        ])

        const soldJson = await soldRes.json()
        const rentalJson = await rentalRes.json()

        if (soldJson.success) {
          const d = soldJson.data || {
            sales: soldJson.sales || [],
            average: soldJson.average || 0,
            count: soldJson.count || 0,
          }
          setSoldData(d)
        }

        if (rentalJson.success && rentalJson.data) {
          setRentalEstimate(rentalJson.data)
        }

        if (!soldJson.success && !rentalJson.success) {
          setError("Could not fetch comparables for this postcode")
        }
      } catch {
        setError("Failed to load comparables")
      } finally {
        setLoading(false)
      }
    }

    fetchComparables()
  }, [postcode, bedrooms, propertyType, propertyTypeDetail, tenureType])

  // Fetch live rental listings (separate call — only for rental strategies)
  useEffect(() => {
    if (!showRentals || !postcode) return

    async function fetchRentalListings() {
      setRentalLoading(true)
      try {
        const res = await fetch("/api/comparables/rental-listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postcode,
            bedrooms,
            ...(propertyType ? { propertyType } : {}),
            ...(propertyTypeDetail ? { propertyTypeDetail } : {}),
            strategy: investmentType || "btl",
          }),
        })
        const json = await res.json()
        if (json.success && json.data) {
          setRentalListings(json.data)
        }
      } catch {
        // Rental listings fetch failed — not critical
      } finally {
        setRentalLoading(false)
      }
    }

    fetchRentalListings()
  }, [postcode, bedrooms, propertyType, propertyTypeDetail, investmentType, showRentals])

  // ── Loading State ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Market Comparables</CardTitle>
          <CardDescription>Loading sold prices and rental data...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    )
  }

  // ── Error / Empty State ─────────────────────────────────────────────────
  if (error && !soldData) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Market Comparables</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <MapPin className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground max-w-[280px]">
              Comparable data is unavailable for this postcode right now. Try again later.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const priceDiff =
    currentPrice && soldData?.average
      ? ((currentPrice - soldData.average) / soldData.average) * 100
      : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Market Comparables</CardTitle>
          <Badge variant="outline" className="text-xs">
            {postcode}
          </Badge>
        </div>
        {/* Tab buttons */}
        <div className="flex gap-1 mt-2">
          <button
            onClick={() => setActiveTab("sold")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "sold"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Home className="inline size-3 mr-1" />
            Sold Prices
          </button>
          {showRentals && (
            <button
              onClick={() => setActiveTab("rental")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "rental"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <PoundSterling className="inline size-3 mr-1" />
              Rental
              {rentalListings && rentalListings.count > 0 && (
                <span className="ml-1 bg-primary-foreground/20 text-[10px] px-1 rounded">
                  {rentalListings.count}
                </span>
              )}
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── SOLD TAB ─────────────────────────────────────────────── */}
        {activeTab === "sold" && (
          <>
            <CardDescription className="text-xs">
              Recent sales from Land Registry
              {propertyTypeDetail ? ` · ${propertyTypeDetail.replace(/-/g, " ")}` : ""}
              {tenureType ? ` · ${tenureType}` : ""}
              {soldData && soldData.radiusMiles && soldData.radiusMiles > 0
                ? ` · within ${soldData.radiusMiles} mile${soldData.radiusMiles !== 1 ? "s" : ""}`
                : ""}
            </CardDescription>

            {/* Average Price */}
            {soldData && soldData.average > 0 && (
              <div className="rounded-lg bg-primary/5 p-3">
                <div className="text-sm text-muted-foreground">Average Sold Price</div>
                <div className="text-2xl font-bold text-foreground">
                  {formatCurrency(soldData.average)}
                </div>
                {priceDiff !== null && (
                  <div className={`text-sm mt-1 ${priceDiff > 0 ? "text-destructive" : "text-success"}`}>
                    {priceDiff > 0 ? "↑" : "↓"} {Math.abs(priceDiff).toFixed(1)}% vs asking price
                  </div>
                )}
              </div>
            )}

            {/* Rental Estimate (from PropertyData / LR fallback) */}
            {rentalEstimate && rentalEstimate.monthly > 0 && (
              <div className="rounded-lg bg-primary/5 p-3">
                <div className="text-sm text-muted-foreground">Estimated Monthly Rent</div>
                <div className="text-lg font-bold text-foreground">
                  {formatCurrency(rentalEstimate.monthly)}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </div>
                {rentalEstimate.range && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Range: {formatCurrency(rentalEstimate.range.low)} – {formatCurrency(rentalEstimate.range.high)}
                  </div>
                )}
                {currentPrice && rentalEstimate.monthly > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs">
                    <TrendingUp className="size-3 text-success" />
                    <span className="text-muted-foreground">Gross Yield:</span>
                    <span className="font-bold text-success">
                      {(((rentalEstimate.monthly * 12) / currentPrice) * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Recent Sales List */}
            {soldData && soldData.sales.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Recent Sales ({soldData.count} found)</div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {soldData.sales.slice(0, 8).map((sale, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm p-2 rounded bg-muted/50"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{formatCurrency(sale.price)}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {sale.street}
                        </span>
                        {(sale.propertyType || sale.tenure) && (
                          <div className="flex gap-1">
                            {sale.propertyType && (
                              <span className="text-[10px] capitalize rounded bg-primary/10 text-primary px-1.5 py-0.5">
                                {sale.propertyType}
                              </span>
                            )}
                            {sale.tenure && (
                              <span className="text-[10px] capitalize rounded bg-muted text-muted-foreground px-1.5 py-0.5">
                                {sale.tenure}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(sale.date).toLocaleDateString("en-GB", {
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rightmove sold prices link */}
            {soldData && postcode && (
              <a
                href={`https://www.rightmove.co.uk/house-prices/${postcode.replace(/\s+/g, "-").toLowerCase()}.html`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-xs text-primary hover:text-primary/80 py-2 border-t border-border/30 mt-2"
              >
                View area sold prices on Rightmove
                <ExternalLink className="size-3" />
              </a>
            )}

            {soldData && soldData.sales.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">
                No recent sales found for this postcode or nearby area
              </div>
            )}
          </>
        )}

        {/* ── RENTAL TAB ───────────────────────────────────────────── */}
        {activeTab === "rental" && showRentals && (
          <>
            <CardDescription className="text-xs">
              Live rental listings from Rightmove · {bedrooms} bed
              {propertyTypeDetail ? ` · ${propertyTypeDetail.replace(/-/g, " ")}` : ""}
            </CardDescription>

            {rentalLoading && (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}

            {!rentalLoading && rentalListings && rentalListings.listings.length > 0 && (
              <>
                {/* Summary stats */}
                <div className="rounded-lg bg-primary/5 p-3">
                  <div className="text-sm text-muted-foreground">Average Rent</div>
                  <div className="text-2xl font-bold text-foreground">
                    {formatCurrency(rentalListings.averageRent)}
                    <span className="text-sm font-normal text-muted-foreground"> pcm</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Range: {formatCurrency(rentalListings.minRent)} – {formatCurrency(rentalListings.maxRent)} pcm
                  </div>
                  {currentPrice && rentalListings.averageRent > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs">
                      <TrendingUp className="size-3 text-success" />
                      <span className="text-muted-foreground">Gross Yield (avg rent):</span>
                      <span className="font-bold text-success">
                        {(((rentalListings.averageRent * 12) / currentPrice) * 100).toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Listing cards */}
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {rentalListings.listings.map((listing, i) => (
                    <div
                      key={i}
                      className="flex gap-3 p-2 rounded bg-muted/50 text-sm"
                    >
                      {/* Thumbnail */}
                      {listing.imageUrl && (
                        <div className="shrink-0 w-16 h-12 rounded overflow-hidden bg-muted">
                          <img
                            src={listing.imageUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      )}

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground">
                              {formatCurrency(listing.monthlyRent)}
                              <span className="text-xs font-normal text-muted-foreground"> pcm</span>
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {listing.address}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {listing.bedrooms && (
                                <span className="text-[10px] rounded bg-primary/10 text-primary px-1.5 py-0.5">
                                  {listing.bedrooms} bed
                                </span>
                              )}
                              {listing.propertyType && (
                                <span className="text-[10px] rounded bg-muted text-muted-foreground px-1.5 py-0.5 capitalize truncate max-w-[120px]">
                                  {listing.propertyType}
                                </span>
                              )}
                            </div>
                            {listing.rentLabel && (
                              <div className="text-[10px] text-amber-600 mt-0.5">
                                {listing.rentLabel}
                              </div>
                            )}
                          </div>

                          {/* External link */}
                          {listing.listingUrl && (
                            <a
                              href={listing.listingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-primary hover:text-primary/80"
                              title="View listing"
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary line */}
                <div className="text-xs text-muted-foreground text-center pt-2 border-t">
                  {rentalListings.count} rental comparable{rentalListings.count !== 1 ? "s" : ""} found
                  {" · "}Average rent: {formatCurrency(rentalListings.averageRent)} pcm
                  {" · "}Range: {formatCurrency(rentalListings.minRent)} – {formatCurrency(rentalListings.maxRent)} pcm
                </div>

                {investmentType === "r2sa" && (
                  <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
                    SA comparables are approximate — nightly rates converted to monthly estimates.
                  </div>
                )}
              </>
            )}

            {!rentalLoading && (!rentalListings || rentalListings.listings.length === 0) && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <PoundSterling className="size-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {rentalListings?.message || "No rental comparables found in this area"}
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
