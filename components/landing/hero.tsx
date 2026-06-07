"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight,
  Sparkles,
  TrendingUp,
  Home,
  CheckCircle2,
  Receipt,
} from "lucide-react"
import { motion } from "framer-motion"
import { HeroText } from "@/components/animations"
import { useEffect, useState } from "react"

/** Format a deal count for display — floor to nearest 10 with "+" suffix */
function formatDealCount(n: number): string {
  const floored = Math.max(10, Math.floor(n / 10) * 10)
  return floored.toLocaleString() + "+"
}

const float = (delay = 0, distance = 14) => ({
  animate: { y: [0, -distance, 0] },
  transition: {
    duration: 5,
    repeat: Infinity,
    ease: "easeInOut" as const,
    delay,
  },
})

export function Hero() {
  const [dealCount, setDealCount] = useState("10+")

  useEffect(() => {
    fetch("/api/stats/deal-count")
      .then((r) => r.json())
      .then((d) => setDealCount(formatDealCount(d.count ?? 10)))
      .catch(() => setDealCount("10+"))
  }, [])

  return (
    <section className="relative overflow-hidden">
      {/* Grid background — dark mode only */}
      <div
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(0.25 0.02 260 / 0.3) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.25 0.02 260 / 0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      {/* Soft radial glow behind the mockup — both themes, subtle */}
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,var(--glow)_0%,transparent_70%)]" />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pb-24 pt-16 text-center md:pt-24">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <Badge
            variant="outline"
            className="mb-6 gap-1.5 border-primary/30 bg-primary/5 px-3 py-1 text-primary"
          >
            <Sparkles className="size-3" />
            AI-Powered Property Analysis
          </Badge>
        </motion.div>

        {/* Headline */}
        <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight text-foreground md:text-6xl lg:text-[4.25rem] lg:leading-[1.05]">
          <HeroText text="Know Your Numbers" delay={0.25} />
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="mt-1 block bg-gradient-to-r from-primary to-[var(--brand-teal)] bg-clip-text text-transparent"
          >
            Before You Invest
          </motion.span>
        </h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg"
        >
          Analyse any UK property deal in seconds. Instant SDLT, rental yield,
          cash flow and AI-powered insights that help you make smarter decisions.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.05 }}
          className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Button asChild size="xl" className="group">
            <Link href="/analyse">
              Analyse a Deal
              <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="xl">
            <a href="#features">See How It Works</a>
          </Button>
        </motion.div>

        {/* Trust line */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.2 }}
          className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"
        >
          <CheckCircle2 className="size-4 text-[var(--success)]" />
          <span>
            <span className="font-semibold text-foreground">{dealCount}</span>{" "}
            deals analysed · No card required
          </span>
        </motion.p>

        {/* ── Product mockup showcase ───────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-16 w-full max-w-4xl"
        >
          <DashboardMockup />

          {/* Floating card — top left: Net Yield + mini bar chart */}
          <motion.div
            {...float(0.2)}
            className="absolute -left-4 top-16 hidden w-44 rounded-xl border border-border/60 bg-card/90 p-4 shadow-xl backdrop-blur-md sm:block lg:-left-16"
          >
            <p className="text-2xl font-bold text-foreground">6.4%</p>
            <p className="text-xs text-muted-foreground">Net Rental Yield</p>
            <div className="mt-3 flex items-end gap-1">
              {[40, 55, 48, 70, 62, 85].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-primary"
                  style={{ height: `${h * 0.32}px`, opacity: 0.4 + i * 0.1 }}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] font-medium text-[var(--success)]">
              ▲ Above area average
            </p>
          </motion.div>

          {/* Floating card — top right: Verdict notification */}
          <motion.div
            {...float(0.6)}
            className="absolute -right-4 top-8 hidden w-52 rounded-xl border border-border/60 bg-card/90 p-3 shadow-xl backdrop-blur-md sm:block lg:-right-16"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--success)]/15">
                <CheckCircle2 className="size-5 text-[var(--success)]" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground">
                  Strong Buy
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Deal score 82 / 100
                </p>
              </div>
            </div>
          </motion.div>

          {/* Floating card — bottom right: SDLT receipt */}
          <motion.div
            {...float(1)}
            className="absolute -right-2 bottom-12 hidden w-44 rounded-xl border border-border/60 bg-card/90 p-4 shadow-xl backdrop-blur-md md:block lg:-right-14"
          >
            <div className="flex items-center gap-2">
              <Receipt className="size-4 text-primary" />
              <p className="text-xs font-medium text-muted-foreground">
                Stamp Duty (SDLT)
              </p>
            </div>
            <p className="mt-2 text-xl font-bold text-foreground">£11,750</p>
            <p className="text-[11px] text-muted-foreground">
              incl. 5% BTL surcharge
            </p>
          </motion.div>

          {/* Floating card — bottom left: Monthly cashflow */}
          <motion.div
            {...float(0.4)}
            className="absolute -left-2 bottom-10 hidden w-40 rounded-xl border border-border/60 bg-card/90 p-4 shadow-xl backdrop-blur-md md:block lg:-left-12"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-[var(--success)]" />
              <p className="text-xs font-medium text-muted-foreground">
                Monthly Cash Flow
              </p>
            </div>
            <p className="mt-2 text-xl font-bold text-[var(--success)]">+£412</p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

/* ── Central dashboard mockup ─────────────────────────────────────────
   A faux Metalyzi deal-analysis screen. Built entirely from theme tokens
   so it reads correctly in both light and dark mode. */
function DashboardMockup() {
  const metrics = [
    { label: "Purchase Price", value: "£285,000" },
    { label: "Net Yield", value: "6.4%", tone: "text-primary" },
    { label: "Cash Flow / mo", value: "+£412", tone: "text-[var(--success)]" },
    { label: "ROI (Year 1)", value: "11.2%", tone: "text-primary" },
  ]
  // 5-year equity projection bars
  const projection = [38, 50, 61, 74, 88]

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-3">
        <span className="size-3 rounded-full bg-destructive/60" />
        <span className="size-3 rounded-full bg-[var(--warning)]/70" />
        <span className="size-3 rounded-full bg-[var(--success)]/70" />
        <div className="ml-3 flex items-center gap-2 rounded-md bg-background/60 px-3 py-1">
          <Home className="size-3 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">
            metalyzi.com/analyse
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="grid gap-5 p-5 text-left md:grid-cols-5 md:p-7">
        {/* Left: property summary + verdict */}
        <div className="md:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Deal Analysis
          </p>
          <h3 className="mt-1 text-lg font-bold text-foreground">
            14 Oakfield Road
          </h3>
          <p className="text-sm text-muted-foreground">Manchester M20 · BTL</p>

          {/* Score ring */}
          <div className="mt-5 flex items-center gap-4 rounded-xl border border-border/60 bg-background/50 p-4">
            <div className="relative flex size-16 items-center justify-center">
              <svg viewBox="0 0 36 36" className="size-16 -rotate-90">
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  className="stroke-muted"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  className="stroke-[var(--success)]"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="97.4"
                  strokeDashoffset="17.5"
                />
              </svg>
              <span className="absolute text-lg font-bold text-foreground">
                82
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--success)]">
                Strong Buy
              </p>
              <p className="text-xs text-muted-foreground">
                Healthy yield, positive cash flow.
              </p>
            </div>
          </div>
        </div>

        {/* Right: metrics grid + projection chart */}
        <div className="md:col-span-3">
          <div className="grid grid-cols-2 gap-3">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-border/60 bg-background/50 p-3"
              >
                <p className="text-[11px] text-muted-foreground">{m.label}</p>
                <p
                  className={`mt-1 text-lg font-bold ${m.tone ?? "text-foreground"}`}
                >
                  {m.value}
                </p>
              </div>
            ))}
          </div>

          {/* 5-year equity projection */}
          <div className="mt-3 rounded-xl border border-border/60 bg-background/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground">
                5-Year Equity Projection
              </p>
              <span className="text-[11px] font-semibold text-primary">
                +£64,200
              </span>
            </div>
            <div className="mt-3 flex h-20 items-end gap-2">
              {projection.map((h, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-sm bg-gradient-to-t from-primary to-[var(--brand-teal)]"
                    style={{ height: `${h}%`, opacity: 0.55 + i * 0.09 }}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Y{i + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
