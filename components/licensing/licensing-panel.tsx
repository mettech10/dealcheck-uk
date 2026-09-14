"use client"

/**
 * Analyse-flow + standalone licensing panel.
 *
 * Fetches POST /v1/licensing/check and renders the four P0–P1 flags with
 * traffic lights, severity, confidence, freshness and sources.
 * Always shows the legal-clearance disclaimer and the Planning Data A4
 * incomplete banner. Hidden when licensing_checker_v1 is off.
 */

import { useEffect, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  ExternalLink,
  Info,
  Loader2,
  Scale,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { isLicensingCheckerEnabled } from "@/lib/licensing/flag"
import type {
  LicensingBanner,
  LicensingCheckResult,
  LicensingFlag,
  LicensingIntendedUse,
} from "@/lib/licensing/types"
import { TrafficLightDot, TrafficLightLabel, trafficTone } from "./traffic-light"

export interface LicensingPanelProps {
  postcode?: string | null
  occupants?: number | null
  rooms?: number | null
  intendedUse?: LicensingIntendedUse | null
  /** When true, omit the outer card chrome (standalone page supplies its own). */
  embedded?: boolean
  /** Preloaded result — skips fetch when provided. */
  result?: LicensingCheckResult | null
}

const SEVERITY_LABEL: Record<LicensingFlag["severity"], string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
}

const CONFIDENCE_LABEL: Record<LicensingFlag["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  none: "No confidence",
}

export function LicensingPanel({
  postcode,
  occupants,
  rooms,
  intendedUse,
  embedded = false,
  result: preload,
}: LicensingPanelProps) {
  const enabled = isLicensingCheckerEnabled()
  const [result, setResult] = useState<LicensingCheckResult | null>(preload ?? null)
  const [loading, setLoading] = useState(!preload && !!postcode)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (preload) {
      setResult(preload)
      setLoading(false)
      setError(null)
      return
    }
    if (!enabled || !postcode) {
      setResult(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch("/v1/licensing/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postcode,
            occupants: occupants ?? undefined,
            rooms: rooms ?? undefined,
            intendedUse: intendedUse ?? undefined,
          }),
        })
        if (res.status === 404) {
          if (!cancelled) {
            setResult(null)
            setError(null)
            setLoading(false)
          }
          return
        }
        if (!res.ok) {
          throw new Error(`Check failed (${res.status})`)
        }
        const json = (await res.json()) as LicensingCheckResult
        if (!cancelled) setResult(json)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Licensing check failed")
          setResult(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, postcode, occupants, rooms, intendedUse, preload])

  if (!enabled) return null

  if (!postcode && !preload) {
    return (
      <Shell embedded={embedded} light="grey">
        <p className="text-sm text-muted-foreground">
          Add a postcode to screen mandatory HMO, additional, selective and
          Article 4 C3→C4 flags.
        </p>
      </Shell>
    )
  }

  if (loading) {
    return (
      <Shell embedded={embedded} light="grey">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Checking licensing for {postcode}…
        </div>
      </Shell>
    )
  }

  if (error) {
    return (
      <Shell embedded={embedded} light="grey">
        <p className="text-sm text-muted-foreground">
          Licensing check could not run ({error}). Verify with the local
          housing and planning authorities — this is not legal clearance.
        </p>
      </Shell>
    )
  }

  if (!result) return null

  const body = (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground">{result.overallLabel}</p>
      {result.location.council && (
        <p className="text-[11px] text-muted-foreground">
          {result.location.postcode}
          {result.location.council ? ` · ${result.location.council}` : ""}
          {result.location.country ? ` · ${result.location.country}` : ""}
        </p>
      )}

      {result.banners.map((b) => (
        <Banner key={b.id} banner={b} />
      ))}

      <div className="flex flex-col gap-2">
        {result.flags.map((f) => (
          <FlagRow key={f.id} flag={f} />
        ))}
      </div>

      <p className="border-t border-border/40 pt-3 text-[11px] leading-relaxed text-muted-foreground">
        {result.disclaimer}
      </p>
    </div>
  )

  if (embedded) return body

  return (
    <Shell embedded={false} light={result.overallTrafficLight}>
      {body}
    </Shell>
  )
}

function Shell({
  embedded,
  light,
  children,
}: {
  embedded: boolean
  light: "red" | "amber" | "green" | "grey"
  children: ReactNode
}) {
  if (embedded) return <>{children}</>
  const tone = trafficTone(light)
  return (
    <Card className={`border ${tone.border} ${tone.bg}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Scale className={`size-4 ${tone.text}`} />
          <CardTitle className={`text-sm ${tone.text}`}>Licensing</CardTitle>
          <TrafficLightLabel light={light} className="ml-auto" />
        </div>
        <p className="text-[11px] font-medium text-muted-foreground">
          Screening aid — never legal clearance
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">{children}</CardContent>
    </Card>
  )
}

function Banner({ banner }: { banner: LicensingBanner }) {
  const Icon = banner.tone === "info" ? Info : AlertTriangle
  const cls =
    banner.tone === "amber"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
      : banner.tone === "grey"
        ? "border-border/60 bg-muted/40 text-muted-foreground"
        : "border-border/50 bg-card text-foreground"
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <div className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold">
        <Icon className="size-3.5 shrink-0" />
        {banner.title}
      </div>
      <p className="text-[11px] leading-relaxed opacity-90">{banner.body}</p>
    </div>
  )
}

function FlagRow({ flag }: { flag: LicensingFlag }) {
  const tone = trafficTone(flag.trafficLight)
  return (
    <div className={`rounded-lg border bg-card p-3 ${tone.border}`}>
      <div className="flex flex-wrap items-center gap-2">
        <TrafficLightDot light={flag.trafficLight} />
        <p className="text-xs font-semibold text-foreground">{flag.label}</p>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
          {SEVERITY_LABEL[flag.severity]} · {CONFIDENCE_LABEL[flag.confidence]}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {flag.summary}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span>Freshness: {flag.freshness.label}</span>
        {flag.sources.slice(0, 3).map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
          >
            {s.name}
            <ExternalLink className="size-2.5" />
          </a>
        ))}
      </div>
    </div>
  )
}
