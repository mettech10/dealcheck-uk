import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Sparkles } from "lucide-react"

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Grid background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(0.25 0.02 260 / 0.3) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.25 0.02 260 / 0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      {/* Radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.75_0.15_190_/_0.08)_0%,transparent_70%)]" />

      <div className="relative mx-auto flex max-w-7xl flex-col items-center px-6 pb-24 pt-20 text-center md:pb-32 md:pt-28">
        <Badge
          variant="outline"
          className="mb-6 gap-1.5 border-primary/30 bg-primary/5 px-3 py-1 text-primary"
        >
          <Sparkles className="size-3" />
          AI-Powered Property Analysis
        </Badge>

        <h1 className="max-w-4xl text-balance text-4xl font-bold tracking-tight text-foreground md:text-6xl lg:text-7xl">
          Know Your Numbers Before You Invest
        </h1>

        <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl">
          Analyse any UK property deal in seconds. Get instant SDLT calculations,
          rental yield, cash flow projections, and AI-powered investment insights
          that help you make smarter decisions.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Button asChild size="xl">
            <Link href="/analyse">
              Analyse a Deal
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="#features">See How It Works</a>
          </Button>
        </div>

        {/* Stats bar */}
        <div className="mt-20 grid w-full max-w-3xl grid-cols-1 gap-8 rounded-xl border border-border/50 bg-card/50 px-8 py-6 backdrop-blur-sm sm:grid-cols-3">
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-foreground md:text-3xl">
              10,000+
            </span>
            <span className="text-sm text-muted-foreground">Deals Analysed</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-foreground md:text-3xl">
              98%
            </span>
            <span className="text-sm text-muted-foreground">Calculation Accuracy</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-foreground md:text-3xl">
              4+ hrs
            </span>
            <span className="text-sm text-muted-foreground">Saved Per Deal</span>
          </div>
        </div>
      </div>
    </section>
  )
}
