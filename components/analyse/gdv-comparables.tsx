"use client"

/**
 * GDV / ARV comparable-sales evidence (Feature 2, Section 7).
 *
 * Shows combined HM Land Registry + Rightmove sold comparables under the
 * Development GDV, BRRRR ARV and Flip ARV sections. Runs the combine/scrape
 * CLIENT-SIDE after the page has loaded (useEffect) so it never blocks the
 * initial render. Rightmove comps carry photos + a deep link; Land Registry
 * comps show a house-icon placeholder. Always attributes both sources.
 */
import { useEffect, useState } from "react"
import { Home } from "lucide-react"
import type { BackendResults } from "@/lib/types"
import {
  buildGdvComparables,
  landRegistryComparables,
  type GdvComparablesResult,
  type GdvComparable,
} from "@/lib/gdvComparables"
import { formatCurrency } from "@/lib/calculations"

interface GdvComparablesProps {
  heading: string
  subheading?: string
  postcode?: string
  propertyType?: string
  bedrooms?: number
  floorSizeM2?: number | null
  isNewBuild?: boolean
  backendData?: BackendResults | null
}

function SourceBadge({ source }: { source: GdvComparable["source"] }) {
  const isRm = source === "rightmove_sold"
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
        isRm
          ? "bg-primary/15 text-primary"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {isRm ? "Rightmove" : "Land Registry"}
    </span>
  )
}

/** Land Registry addresses arrive fully upper-cased ("BROOKBANK") —
 *  normalise to title case so the cards read professionally. */
function displayAddress(address: string): string {
  const letters = address.replace(/[^a-zA-Z]/g, "")
  if (!letters || letters !== letters.toUpperCase()) return address
  return address
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    // Postcodes back to caps (e.g. "Wn7 5dd" → "WN7 5DD")
    .replace(/\b([a-z]{1,2}\d[a-z\d]?)\s*(\d[a-z]{2})\b/gi, (m) => m.toUpperCase())
}

function CompCard({ comp }: { comp: GdvComparable }) {
  const ppm2 =
    comp.floorSizeM2 && comp.price ? Math.round(comp.price / comp.floorSizeM2) : null
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-3">
      {comp.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={comp.thumbnailUrl}
          alt={comp.address}
          className="size-[60px] shrink-0 rounded object-cover"
          style={{ width: 80, height: 60 }}
          onError={(e) => {
            // Never show a broken-image icon — hide and fall back to spacing.
            e.currentTarget.style.display = "none"
          }}
        />
      ) : (
        <div className="flex size-[60px] shrink-0 items-center justify-center rounded bg-muted/60" style={{ width: 80, height: 60 }}>
          <Home className="size-4 text-muted-foreground/50" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">
          {displayAddress(comp.address)}
        </span>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{formatCurrency(comp.price)}</span>
          {comp.dateSold && <span>· Sold {comp.dateSold}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {comp.bedrooms ? <span>{comp.bedrooms} bed</span> : null}
          {comp.propertyType ? <span>· {comp.propertyType}</span> : null}
          {ppm2 ? <span>· £{ppm2.toLocaleString()}/m²</span> : null}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <SourceBadge source={comp.source} />
          {comp.source === "rightmove_sold" && comp.listingUrl && (
            <a
              href={comp.listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-medium text-primary hover:underline"
            >
              View on Rightmove →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export function GdvComparables({
  heading,
  subheading,
  postcode,
  propertyType,
  bedrooms,
  floorSizeM2,
  isNewBuild,
  backendData,
}: GdvComparablesProps) {
  // Seed immediately with the Land Registry comps already in the payload so
  // there's evidence on screen even before the Rightmove scrape resolves.
  const [result, setResult] = useState<GdvComparablesResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    buildGdvComparables({
      postcode: postcode ?? "",
      propertyType,
      bedrooms,
      floorSizeM2: floorSizeM2 ?? null,
      isNewBuild,
      backend: backendData ?? undefined,
    })
      .then((r) => {
        if (!cancelled) setResult(r)
      })
      .catch(() => {
        // Last-resort: at least show Land Registry comps.
        if (!cancelled) {
          const lr = landRegistryComparables(backendData ?? undefined)
          setResult({
            conservativeARV: null,
            midARV: null,
            optimisticARV: null,
            avgPrice: null,
            avgPricePerM2: null,
            priceRange: null,
            comparables: lr,
            rightmoveComps: 0,
            landRegComps: lr.length,
            totalComps: lr.length,
            methodology: "",
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [postcode, propertyType, bedrooms, floorSizeM2, isNewBuild, backendData])

  // Nothing to show and nothing loading → render nothing (keeps the section
  // clean for strategies/areas with no comparable evidence at all).
  if (!loading && (!result || result.totalComps === 0)) return null

  const district = (postcode ?? "").split(" ")[0].toUpperCase()

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/40 p-4">
      <div>
        <h4 className="text-sm font-semibold text-foreground">
          {heading}
          {district ? ` — ${district}` : ""}
        </h4>
        <p className="text-xs text-muted-foreground">
          {subheading ??
            `${result?.totalComps ?? 0} recent sales supporting your estimate`}
        </p>
      </div>

      {loading && !result ? (
        <p className="py-3 text-xs text-muted-foreground">Loading comparable sales…</p>
      ) : result ? (
        <>
          {/* Summary bar */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{result.totalComps}</span> comparables
            </span>
            {result.avgPrice != null && (
              <span className="text-muted-foreground">
                Avg: <span className="font-semibold text-foreground">{formatCurrency(result.avgPrice)}</span>
              </span>
            )}
            {result.priceRange && (
              <span className="text-muted-foreground">
                Range: <span className="font-semibold text-foreground">{formatCurrency(result.priceRange.low)}–{formatCurrency(result.priceRange.high)}</span>
              </span>
            )}
            {result.avgPricePerM2 != null && (
              <span className="text-muted-foreground">
                Avg £/m²: <span className="font-semibold text-foreground">£{result.avgPricePerM2.toLocaleString()}</span>
              </span>
            )}
          </div>

          {/* Cards */}
          <div className="grid gap-2 sm:grid-cols-2">
            {result.comparables.slice(0, 8).map((c, i) => (
              <CompCard key={`${c.source}-${i}-${c.address}`} comp={c} />
            ))}
          </div>

          {/* Source attribution — Rightmove is primary; LR is the fallback. */}
          <p className="text-[11px] text-muted-foreground/80">
            {result.landRegComps === 0
              ? "Source: Rightmove sold listings"
              : result.rightmoveComps === 0
              ? "Source: HM Land Registry"
              : "Sources: Rightmove sold listings + HM Land Registry"}
          </p>
        </>
      ) : null}
    </div>
  )
}
