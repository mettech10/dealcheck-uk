"use client"

/**
 * /masterclass — public lead-capture landing page for the UK Deal Sourcing
 * Masterclass PDF (no login required; the proxy only gates /admin).
 *
 * Two states:
 *   1. Form — name/email + two segmentation dropdowns (investor type,
 *      main strategy). These drive the nurture personalisation.
 *   2. Unlocked — download button + "Try Metalyzi Free" CTA. This renders
 *      the moment /api/masterclass/capture succeeds; the same endpoint
 *      also fires the Brevo welcome email with the PDF link.
 *
 * UTM params + referrer are read client-side and passed through to the
 * capture API so ad-source quality shows up in the admin funnel.
 */

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Download,
  Lightbulb,
  Loader2,
} from "lucide-react"

const VALUE_BULLETS = [
  "The 6 strategies investors actually buy",
  "7 channels where real deals come from",
  "The exact numbers that decide a deal",
  "Article 4, lease traps & due diligence",
  "How to package deals investors say yes to",
  "Compliance most sourcers get wrong",
]

const INVESTOR_TYPES = [
  { value: "new", label: "New to property investing" },
  { value: "active", label: "Active investor (1-5 properties)" },
  { value: "experienced", label: "Experienced investor (5+)" },
  { value: "sourcer", label: "Deal sourcer" },
  { value: "agent", label: "Estate agent / broker" },
  { value: "researching", label: "Just researching" },
]

const STRATEGIES = [
  { value: "BTL", label: "Buy-to-Let (BTL)" },
  { value: "HMO", label: "HMO" },
  { value: "BRRRR", label: "BRRRR" },
  { value: "Flip", label: "Flip" },
  { value: "SA", label: "Serviced Accommodation" },
  { value: "Development", label: "Development" },
  { value: "not_sure", label: "Not sure yet" },
]

export default function MasterclassPage() {
  const [firstName, setFirstName] = useState("")
  const [email, setEmail] = useState("")
  const [investorType, setInvestorType] = useState("")
  const [mainStrategy, setMainStrategy] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState("/downloads/masterclass.pdf")

  // UTM + referrer captured on mount (client-only values).
  const [tracking, setTracking] = useState<{
    utmSource?: string
    utmCampaign?: string
    utmMedium?: string
    referrer?: string
  }>({})

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setTracking({
      utmSource: params.get("utm_source") ?? undefined,
      utmCampaign: params.get("utm_campaign") ?? undefined,
      utmMedium: params.get("utm_medium") ?? undefined,
      referrer: document.referrer || undefined,
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address")
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch("/api/masterclass/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          email,
          investorType,
          mainStrategy,
          ...tracking,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error ?? "Something went wrong. Please try again.")
      }
      if (data?.downloadUrl) setDownloadUrl(data.downloadUrl)
      setUnlocked(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = () => {
    // Fire-and-forget download tracking — never block the download itself.
    fetch("/api/masterclass/track-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {})

    const a = document.createElement("a")
    a.href = downloadUrl
    a.download = "UK-Deal-Sourcing-Masterclass.pdf"
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo-navy.png"
              alt="Metalyzi Logo"
              width={28}
              height={28}
              className="rounded-lg object-contain dark:hidden"
            />
            <Image
              src="/logo.png"
              alt="Metalyzi Logo"
              width={28}
              height={28}
              className="rounded-lg object-contain hidden dark:block"
            />
            <span className="text-sm font-semibold text-foreground">Metalyzi</span>
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link href="/analyse">
              Try Metalyzi
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-12 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-5 lg:gap-16">
          {/* Left — pitch (60%) */}
          <div className="lg:col-span-3">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-teal-600 dark:text-teal-400">
              Free Masterclass · 2026
            </p>
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground lg:text-5xl">
              The UK Deal Sourcing Masterclass
            </h1>
            <p className="mb-8 max-w-xl text-lg text-muted-foreground">
              The complete playbook for finding, analysing and packaging
              profitable UK property deals — used by professional sourcers.
            </p>

            <ul className="mb-8 space-y-3">
              {VALUE_BULLETS.map((bullet) => (
                <li key={bullet} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-500/15">
                    <Check className="size-3.5 text-teal-600 dark:text-teal-400" />
                  </span>
                  <span className="text-sm text-foreground lg:text-base">{bullet}</span>
                </li>
              ))}
            </ul>

            <p className="text-sm text-muted-foreground">
              Join <span className="font-semibold text-foreground">200+</span>{" "}
              UK investors who&apos;ve downloaded the guide
            </p>
          </div>

          {/* Right — cover + form card (40%) */}
          <div className="lg:col-span-2">
            {/* PDF cover thumbnail */}
            <div className="mx-auto mb-6 w-48 rotate-1 rounded-lg border border-border shadow-xl">
              <div className="flex aspect-[210/297] flex-col justify-between rounded-lg bg-[#0a1628] p-5">
                <div>
                  <BookOpen className="mb-3 size-6 text-teal-400" />
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-teal-400">
                    Metalyzi · 2026 Edition
                  </p>
                </div>
                <div>
                  <p className="text-lg font-bold leading-tight text-white">
                    The UK Deal Sourcing Masterclass
                  </p>
                  <p className="mt-2 text-[10px] leading-snug text-slate-400">
                    Find, analyse &amp; package profitable property deals
                  </p>
                </div>
                <div className="h-1 w-12 rounded-full bg-teal-400" />
              </div>
            </div>

            {unlocked ? (
              /* State 2 — download unlocked */
              <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
                <div className="mb-4 flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-teal-500" />
                  <h2 className="text-lg font-bold text-foreground">
                    Your masterclass is ready!
                  </h2>
                </div>
                <p className="mb-5 text-sm text-muted-foreground">
                  We&apos;ve also sent a copy to{" "}
                  <span className="font-medium text-foreground">{email}</span>
                </p>

                <Button
                  onClick={handleDownload}
                  size="lg"
                  className="mb-6 w-full bg-teal-500 text-base font-semibold text-[#0a1628] hover:bg-teal-400"
                >
                  <Download className="size-4" />
                  Download the PDF
                </Button>

                <div className="border-t border-border pt-5">
                  <div className="mb-2 flex items-center gap-2">
                    <Lightbulb className="size-4 text-amber-500" />
                    <p className="text-sm font-semibold text-foreground">
                      While you&apos;re here...
                    </p>
                  </div>
                  <p className="mb-4 text-sm text-muted-foreground">
                    The guide shows you how to analyse deals manually. Want to
                    do it in 60 seconds instead?
                  </p>
                  <Button
                    asChild
                    size="lg"
                    className="w-full bg-[#0a1f4e] text-base font-semibold text-white hover:bg-[#132a5e]"
                  >
                    <Link href="/analyse?utm_source=masterclass_landing">
                      Try Metalyzi Free
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    3 free analyses/month. No card required.
                  </p>
                </div>
              </div>
            ) : (
              /* State 1 — lead capture form */
              <form
                onSubmit={handleSubmit}
                className="rounded-xl border border-border bg-card p-6 shadow-lg"
              >
                <h2 className="mb-5 text-lg font-bold text-foreground">
                  Get your free copy
                </h2>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="mc-first-name">First Name</Label>
                    <Input
                      id="mc-first-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Your first name"
                      autoComplete="given-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mc-email">Email Address</Label>
                    <Input
                      id="mc-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>What best describes you?</Label>
                    <Select value={investorType} onValueChange={setInvestorType}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select one" />
                      </SelectTrigger>
                      <SelectContent>
                        {INVESTOR_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>What&apos;s your main strategy?</Label>
                    <Select value={mainStrategy} onValueChange={setMainStrategy}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select one" />
                      </SelectTrigger>
                      <SelectContent>
                        {STRATEGIES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {error && (
                    <p className="text-sm text-red-500" role="alert">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    disabled={isLoading}
                    className="w-full bg-teal-500 text-base font-semibold text-[#0a1628] hover:bg-teal-400"
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        Send Me The Masterclass
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>

                  <p className="text-center text-xs leading-relaxed text-muted-foreground">
                    We&apos;ll email you the guide plus occasional property
                    investing tips. Unsubscribe anytime.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
