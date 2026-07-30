"use client"

/**
 * /discovery — Deal Discovery.
 *
 * Search builder → progress → ranked shortlist. "View Full Analysis" deep
 * links into the existing /analyse flow (?url=&strategy=) so the standard
 * results page is reused rather than rebuilt.
 *
 * Pro-tier gated: the API refuses non-Pro callers, and this page shows the
 * upgrade prompt instead of the builder so no search can even be started.
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ArrowLeft,
  Loader2,
  Search,
  Sparkles,
  X,
  AlertTriangle,
  Home,
} from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

const STRATEGIES = ["BTL", "HMO", "BRRRR", "SA", "FLIP"] as const
const MAX_AREAS = 3

interface Tier1Signals {
  bmvPct: number | null
  estimatedGrossYield: number | null
  estimatedHmoYield: number | null
  article4Status: string
  areaConfidence: string
  hasRefurbLanguage: boolean
  roomPotential: number | null
  missingData?: string[]
  strategySignals?: Array<{ strategy: string; signal: string; reason: string }>
}

interface DiscoveryResult {
  id: string
  listing_url: string
  address: string | null
  postcode: string | null
  price: number | null
  bedrooms: number | null
  property_type: string | null
  thumbnail_url: string | null
  tier1_signals: Tier1Signals | null
  tier1_score: number | null
  passed_tier1: boolean
  strategy_scores: Record<string, number> | null
  best_strategy: string | null
  best_score: number | null
  status: string
}

interface Usage {
  used: number
  limit: number
  tier: string
  allowed: boolean
  reason: string | null
  message: string | null
}

const money = (n: number | null | undefined) =>
  n == null ? "—" : `£${Math.round(n).toLocaleString()}`

/** Article 4 chip — an active direction is always shown, never softened. */
function Article4Chip({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    active: {
      cls: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
      label: "⚠ Article 4 in force",
    },
    proposed: {
      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
      label: "Article 4 proposed",
    },
    none: {
      cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
      label: "✓ No Article 4",
    },
  }
  const cfg = map[status] ?? {
    cls: "bg-muted text-muted-foreground border-border/60",
    label: "Article 4 unconfirmed",
  }
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function ResultCard({
  r,
  onDismiss,
}: {
  r: DiscoveryResult
  onDismiss: (id: string) => void
}) {
  const s = r.tier1_signals
  const scores = Object.entries(r.strategy_scores ?? {}).sort((a, b) => b[1] - a[1])
  const alsoStrong = scores.slice(1).filter(([, v]) => v >= 60)
  const analysed = r.status === "analysed" && r.best_score != null

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-start gap-3">
        {r.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.thumbnail_url}
            alt={r.address ?? "Property"}
            className="size-16 shrink-0 rounded-lg object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none"
            }}
          />
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted/60">
            <Home className="size-5 text-muted-foreground/50" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-foreground">
            {r.address ?? "Address unavailable"}
          </span>
          <span className="text-xs text-muted-foreground">
            {money(r.price)}
            {r.bedrooms ? ` · ${r.bedrooms} bed` : ""}
            {r.property_type ? ` · ${r.property_type}` : ""}
          </span>
        </div>
        {analysed && (
          <div className="shrink-0 text-right">
            <div className="text-xl font-bold text-foreground">{r.best_score}</div>
            <div className="text-[11px] text-muted-foreground">/100</div>
          </div>
        )}
      </div>

      {analysed ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary">
            Best as {r.best_strategy}
          </span>
          {alsoStrong.map(([k, v]) => (
            <span key={k} className="text-muted-foreground">
              also {k} ({v})
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Screened only — outside the top {15} for deep analysis this run.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {s?.article4Status && <Article4Chip status={s.article4Status} />}
        {s?.estimatedGrossYield != null && (
          <span className="text-[11px] text-muted-foreground">
            Est. yield {s.estimatedGrossYield}%
          </span>
        )}
        {s?.estimatedHmoYield != null && (
          <span className="text-[11px] text-muted-foreground">
            HMO {s.estimatedHmoYield}%
          </span>
        )}
        {s?.bmvPct != null && s.bmvPct > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {s.bmvPct}% below area median
          </span>
        )}
        {s?.hasRefurbLanguage && (
          <span className="text-[11px] text-muted-foreground">refurb potential</span>
        )}
      </div>

      {s?.missingData && s.missingData.length > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          Limited area data — no {s.missingData.join(", ")}. Verify before offering.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button asChild size="sm" className="flex-1">
          <Link
            href={`/analyse?url=${encodeURIComponent(r.listing_url)}${
              r.best_strategy ? `&strategy=${encodeURIComponent(r.best_strategy)}` : ""
            }`}
          >
            View Full Analysis →
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDismiss(r.id)}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}

export default function DiscoveryPage() {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loadingGate, setLoadingGate] = useState(true)

  const [name, setName] = useState("")
  const [areas, setAreas] = useState<string[]>([])
  const [areaInput, setAreaInput] = useState("")
  const [strategies, setStrategies] = useState<string[]>(["BTL", "HMO"])
  const [minPrice, setMinPrice] = useState("")
  const [maxPrice, setMaxPrice] = useState("")
  const [minBeds, setMinBeds] = useState("")
  const [maxBeds, setMaxBeds] = useState("")
  const [recurring, setRecurring] = useState(false)
  const [frequency, setFrequency] = useState("weekly")

  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<DiscoveryResult[]>([])
  const [insights, setInsights] = useState<string[]>([])
  const [filter, setFilter] = useState("ALL")
  const [ran, setRan] = useState(false)

  useEffect(() => {
    fetch("/api/discovery/search")
      .then((r) => r.json())
      .then((d) => setUsage(d.usage ?? null))
      .catch(() => setUsage(null))
      .finally(() => setLoadingGate(false))
  }, [])

  const addArea = () => {
    const a = areaInput.trim().toUpperCase()
    if (!a) return
    if (!/^[A-Z]{1,2}\d[A-Z\d]?$/.test(a)) {
      setError(`"${a}" isn't a valid postcode area (e.g. M14)`)
      return
    }
    if (areas.length >= MAX_AREAS) {
      setError(`Maximum ${MAX_AREAS} areas per search`)
      return
    }
    if (!areas.includes(a)) setAreas([...areas, a])
    setAreaInput("")
    setError(null)
  }

  const toggleStrategy = (s: string) =>
    setStrategies((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  const loadResults = useCallback(async (searchId: string) => {
    const res = await fetch(`/api/discovery/results/${searchId}`)
    if (!res.ok) return
    const d = await res.json()
    setResults(d.results ?? [])
  }, [])

  const run = async () => {
    setError(null)
    setRunning(true)
    setResults([])
    setInsights([])
    try {
      const res = await fetch("/api/discovery/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchName: name,
          postcodeAreas: areas,
          strategies,
          minPrice: Number(minPrice) || undefined,
          maxPrice: Number(maxPrice) || undefined,
          minBedrooms: Number(minBeds) || undefined,
          maxBedrooms: Number(maxBeds) || undefined,
          isRecurring: recurring,
          frequency,
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error ?? "Could not start the search")
        return
      }
      setInsights(d.insights ?? [])
      setRan(true)
      if (d.searchId) await loadResults(d.searchId)
    } catch {
      setError("Something went wrong starting the search")
    } finally {
      setRunning(false)
    }
  }

  const dismiss = async (id: string) => {
    setResults((prev) => prev.filter((r) => r.id !== id))
    await fetch("/api/discovery/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultId: id }),
    }).catch(() => {})
  }

  const shown =
    filter === "ALL" ? results : results.filter((r) => r.best_strategy === filter)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Metalyzi" width={28} height={28} className="rounded-lg object-contain" />
            <span className="text-sm font-semibold text-foreground">Metalyzi</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm">
              <Link href="/analyse">
                <ArrowLeft className="size-3.5" />
                Analyse
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Search className="size-6 text-primary" />
            Deal Discovery
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scan an area for deals worth a closer look. Every listing is screened
            against area data; the strongest get a full analysis.
          </p>
        </div>

        {loadingGate ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking access…
          </div>
        ) : !usage ? (
          /* Access couldn't be confirmed (not logged in, or the check failed).
             Fail closed in the UI — the API gates server-side regardless, but
             showing the builder here would imply access the user may not have. */
          <div className="rounded-xl border border-border/60 bg-card p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 size-7 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">
              Couldn&apos;t confirm your access
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Log in with a Pro account to use Deal Discovery. If you are logged
              in, refresh the page and try again.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Button asChild variant="outline">
                <Link href="/login">Log in</Link>
              </Button>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          </div>
        ) : !usage.allowed && usage.reason === "tier" ? (
          /* ── Pro upgrade prompt — no builder rendered at all ── */
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
            <Sparkles className="mx-auto mb-3 size-8 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Deal Discovery is a Pro feature
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {usage.message}
            </p>
            <Button asChild className="mt-5">
              <Link href="/#pricing">Upgrade to Pro</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* ── Search builder ── */}
            <div className="flex flex-col gap-5 rounded-xl border border-border/60 bg-card p-5">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Search name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="South Manchester HMOs"
                  disabled={running}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">
                  Areas to scan{" "}
                  <span className="text-xs text-muted-foreground">
                    (postcode areas, max {MAX_AREAS})
                  </span>
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  {areas.map((a) => (
                    <span
                      key={a}
                      className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                    >
                      {a}
                      <button type="button" onClick={() => setAreas(areas.filter((x) => x !== a))}>
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  {areas.length < MAX_AREAS && (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={areaInput}
                        onChange={(e) => setAreaInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            addArea()
                          }
                        }}
                        placeholder="M14"
                        className="h-8 w-24"
                        disabled={running}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={addArea} disabled={running}>
                        Add
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Strategies to screen for</Label>
                <div className="flex flex-wrap gap-2">
                  {STRATEGIES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={running}
                      onClick={() => toggleStrategy(s)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        strategies.includes(s)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/60 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Price range (£)</Label>
                  <div className="flex items-center gap-2">
                    <Input value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="100000" type="number" disabled={running} />
                    <span className="text-muted-foreground">–</span>
                    <Input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="250000" type="number" disabled={running} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Bedrooms</Label>
                  <div className="flex items-center gap-2">
                    <Input value={minBeds} onChange={(e) => setMinBeds(e.target.value)} placeholder="3" type="number" disabled={running} />
                    <span className="text-muted-foreground">–</span>
                    <Input value={maxBeds} onChange={(e) => setMaxBeds(e.target.value)} placeholder="6" type="number" disabled={running} />
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                  disabled={running}
                  className="size-4 accent-[var(--primary)]"
                />
                Run this search automatically every
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  disabled={!recurring || running}
                  className="rounded-md border border-border/60 bg-background px-2 py-1 text-sm"
                >
                  <option value="weekly">week</option>
                  <option value="daily">day</option>
                </select>
              </label>

              {error && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-between gap-3">
                {usage && (
                  <span className="text-xs text-muted-foreground">
                    {usage.used}/{usage.limit} searches used this month
                  </span>
                )}
                <Button onClick={run} disabled={running || areas.length === 0 || strategies.length === 0}>
                  {running ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Scanning…
                    </>
                  ) : (
                    "Run Discovery →"
                  )}
                </Button>
              </div>
            </div>

            {/* ── Progress ── */}
            {running && (
              <div className="mt-5 rounded-xl border border-border/60 bg-card p-5">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  Scanning {areas.join(", ")}…
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Screening every listing against area data, then running full
                  analysis on the strongest 15. This can take a couple of minutes.
                </p>
              </div>
            )}

            {/* ── Run summary ── */}
            {!running && insights.length > 0 && (
              <div className="mt-5 rounded-xl border border-border/60 bg-card p-4">
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {insights.map((i, n) => (
                    <li key={n}>· {i}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── Results ── */}
            {!running && ran && (
              <div className="mt-6">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {["ALL", ...STRATEGIES].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        filter === f
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                {shown.length === 0 ? (
                  <p className="rounded-xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
                    No listings passed the screen for this filter. Try widening the
                    price or bedroom range, or adding another area.
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {shown.map((r) => (
                      <ResultCard key={r.id} r={r} onDismiss={dismiss} />
                    ))}
                  </div>
                )}

                <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                  Discovery scores are automated estimates built from area medians
                  and platform default finance assumptions — they are a shortlist,
                  not a valuation. Open the full analysis and check the numbers
                  against your own assumptions before making an offer.
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
