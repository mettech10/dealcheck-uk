"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MapPin, Loader2, Sparkles } from "lucide-react"
import { useLoadingTracker } from "@/lib/useLoadingTracker"

/**
 * Two shapes are accepted from the backend, to allow a gradual rollout:
 *
 *  - LEGACY: { marketOverview, investmentFundamentals, dealInContext,
 *              keyRisks, investorVerdict }
 *  - CURRENT: { items: [{title, body, kind?}], verdict?: {title, body} }
 *
 * Strategy-aware mode (current) lets each investment type ship its own
 * section titles + analytical lens (e.g. "Refurb Uplift Potential" for
 * BRRRR vs "Sharer Demand" for HMO) instead of the one-size 5-section
 * BTL template.
 */
interface SectionItem {
  title: string
  body: string
  kind?: string
}
interface NewSections {
  items: SectionItem[]
  verdict?: SectionItem
}
interface LegacySections {
  marketOverview: string
  investmentFundamentals: string
  dealInContext: string
  keyRisks: string
  investorVerdict: string
}
type Sections = NewSections | LegacySections

interface AreaPayload {
  sections: Sections
  meta: {
    district: string
    council: string
    strategy: string
    generatedAt: string
    sources: string[]
  }
}

interface Props {
  postcode?: string
  strategy?: string
  dealData?: Record<string, unknown>
  benchmark?: Record<string, unknown> | null
  articleFour?: Record<string, unknown> | null
  /** Comp counts / averages threaded through so Claude can quote them. */
  marketContext?: Record<string, unknown> | null
  /** Fallback string from the omnibus AI call — shown if the dedicated call fails. */
  fallbackText?: string
}

/** Normalise either shape into a uniform list + verdict for rendering. */
function normaliseSections(s: Sections): NewSections {
  if ((s as NewSections).items) return s as NewSections
  const legacy = s as LegacySections
  return {
    items: [
      { title: "Market Overview", body: legacy.marketOverview },
      { title: "Investment Fundamentals", body: legacy.investmentFundamentals },
      { title: "This Deal in Context", body: legacy.dealInContext },
      { title: "Key Risks", body: legacy.keyRisks },
    ],
    verdict: { title: "Investor Verdict", body: legacy.investorVerdict },
  }
}

export function AiAreaAnalysisCard({
  postcode,
  strategy,
  dealData,
  benchmark,
  articleFour,
  marketContext,
  fallbackText,
}: Props) {
  const [data, setData] = useState<AreaPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { markDone } = useLoadingTracker()

  useEffect(() => {
    if (!postcode) {
      // No postcode → the card itself renders nothing; still flip
      // the key so the overlay can lift.
      markDone("aiAreaAnalysis")
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch("/api/analysis/area", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postcode,
        strategy,
        dealData,
        benchmark,
        articleFour,
        marketContext,
      }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (cancelled) return
        if (!r.ok || !j?.success) {
          setError(j?.message || "Area analysis unavailable")
          return
        }
        setData(j as AreaPayload)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "Network error")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
        markDone("aiAreaAnalysis")
      })
    return () => {
      cancelled = true
    }
  }, [postcode, strategy, markDone])

  if (!postcode && !fallbackText) return null

  // Loading state
  if (loading && !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            <CardTitle className="text-sm">AI Area Analysis</CardTitle>
            <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-muted/60" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error / fallback state — show the original short paragraph if we have one
  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            <CardTitle className="text-sm">Area Analysis</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {fallbackText ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{fallbackText}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Area analysis temporarily unavailable
              {error ? ` — ${error}` : ""}.
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  const { sections, meta } = data
  const { items, verdict } = normaliseSections(sections)
  const generated = new Date(meta.generatedAt)
  const strategyLabel = (meta.strategy || strategy || "").toUpperCase()

  const Section = ({ title, body }: { title: string; body: string }) => (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
        {title}
      </h4>
      <p className="text-sm leading-relaxed text-foreground/90">{body}</p>
    </div>
  )

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <MapPin className="size-4 text-primary" />
          <CardTitle className="text-sm">AI Area Analysis</CardTitle>
          <span className="text-xs text-muted-foreground">
            {meta.district} · {meta.council}
            {strategyLabel ? ` · ${strategyLabel}` : ""}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
            <Sparkles className="size-3" />
            Metalyzi Intelligence
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {items.map((s, i) => (
            <Section key={i} title={s.title} body={s.body} />
          ))}
          {verdict && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
                {verdict.title || "Investor Verdict"}
              </h4>
              <p className="text-sm font-medium leading-relaxed text-foreground">
                {verdict.body}
              </p>
            </div>
          )}
          <div className="border-t border-border/50 pt-3 text-[10px] leading-relaxed text-muted-foreground/70">
            Data: {meta.sources.join(" · ")}
            <br />
            Generated: {generated.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
