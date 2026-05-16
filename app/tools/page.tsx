import Link from "next/link"
import {
  Calculator,
  Building2,
  Scale,
  ArrowRight,
  Sparkles,
  Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

/**
 * /tools — hub page for Metalyzi's standalone property investment tools.
 *
 * Three live tools (SDLT Calculator, Portfolio Tracker, Deal Comparison)
 * plus a "Coming Soon" rail. SDLT is open-access; Portfolio + Compare
 * require login (the linked routes enforce the gate). This page itself
 * is fully static — safe to be crawled and indexed for SEO.
 */

export const metadata = {
  title: "Property Investment Tools — Metalyzi",
  description:
    "Free property investment tools: SDLT calculator, portfolio tracker, and side-by-side deal comparison. Built for UK landlords and developers.",
}

export default function ToolsHubPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12 md:py-16">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 text-center">
        <Badge variant="outline" className="mx-auto w-fit gap-1.5">
          <Sparkles className="size-3.5 text-primary" />
          Free Tools
        </Badge>
        <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Property Investment Tools
        </h1>
        <p className="mx-auto max-w-2xl text-pretty text-base text-muted-foreground">
          Professional calculators and trackers — free to use, built for UK
          property investors, landlords, and developers.
        </p>
      </header>

      {/* ── Tool cards ─────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <ToolCard
          icon={Calculator}
          title="SDLT Calculator"
          description="Instantly calculate Stamp Duty for any UK property purchase. Covers all buyer types including first-time buyers, standard, and investment purchases with the 5% surcharge."
          bullets={[
            "Apr 2025 rates",
            "All buyer types",
            "England & NI",
          ]}
          ctaLabel="Open Calculator"
          ctaHref="/tools/sdlt-calculator"
          gateLabel="Free · No login required"
          accent="primary"
        />
        <ToolCard
          icon={Building2}
          title="Portfolio Tracker"
          description="Track all your investment properties in one place. See total portfolio value, yield, monthly income, and equity across your entire portfolio."
          bullets={[
            "Unlimited properties (Pro)",
            "Monthly income summary",
            "Equity & LTV tracking",
          ]}
          ctaLabel="Open Portfolio"
          ctaHref="/tools/portfolio"
          gateLabel="Requires login"
          accent="emerald"
        />
        <ToolCard
          icon={Scale}
          title="Deal Comparison"
          description="Compare up to 3 saved deals side by side. See which deal wins on yield, cashflow, capital required, and deal score."
          bullets={[
            "Up to 3 deals (Pro)",
            "All metrics compared",
            "Clear winner recommendation",
          ]}
          ctaLabel="Compare Deals"
          ctaHref="/tools/compare"
          gateLabel="Requires login · Needs 2+ saved deals"
          accent="amber"
        />
      </section>

      {/* ── Coming soon rail ───────────────────────────────────── */}
      <section className="flex flex-col gap-4 rounded-2xl border border-border/40 bg-card/30 p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Coming Soon
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <ComingSoonItem name="Mortgage Calculator" />
          <ComingSoonItem name="Yield Calculator" />
          <ComingSoonItem name="Rental Yield Area Map" />
          <ComingSoonItem name="Refurb Cost Estimator" />
        </div>
      </section>

      {/* ── Footer CTA back to analyser ────────────────────────── */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
        <h3 className="text-lg font-semibold text-foreground">
          Need full deal analysis?
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Get a complete investment breakdown with AI verdict, comparables,
          and area intelligence.
        </p>
        <Button asChild className="mt-4" size="lg">
          <Link href="/analyse">
            Run a Full Deal Analysis
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────

type Accent = "primary" | "emerald" | "amber"

const accentBorder: Record<Accent, string> = {
  primary: "border-primary/30 hover:border-primary/60",
  emerald: "border-emerald-500/30 hover:border-emerald-500/60",
  amber: "border-amber-500/30 hover:border-amber-500/60",
}
const accentIconBg: Record<Accent, string> = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
}

function ToolCard({
  icon: Icon,
  title,
  description,
  bullets,
  ctaLabel,
  ctaHref,
  gateLabel,
  accent,
}: {
  icon: typeof Calculator
  title: string
  description: string
  bullets: string[]
  ctaLabel: string
  ctaHref: string
  gateLabel: string
  accent: Accent
}) {
  return (
    <Card
      className={`flex flex-col border-2 transition-colors ${accentBorder[accent]}`}
    >
      <CardHeader className="pb-3">
        <div className={`mb-3 flex size-10 items-center justify-center rounded-lg ${accentIconBg[accent]}`}>
          <Icon className="size-5" />
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ul className="flex flex-col gap-1.5 text-xs">
          {bullets.map((b) => (
            <li key={b} className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-emerald-500">✓</span> {b}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-2">
          <Button asChild>
            <Link href={ctaHref}>
              {ctaLabel}
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <span className="text-center text-[11px] text-muted-foreground">
            {gateLabel}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function ComingSoonItem({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/30 bg-background/40 px-3 py-2.5 text-xs text-muted-foreground">
      <Lock className="size-3" />
      {name}
    </div>
  )
}
