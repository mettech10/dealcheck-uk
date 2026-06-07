"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Sparkles, Home } from "lucide-react"
import { motion } from "framer-motion"
import { HeroText, PulseElement } from "@/components/animations"
import { useEffect, useState } from "react"

/** Format a deal count for display — floor to nearest 10 with "+" suffix */
function formatDealCount(n: number): string {
  const floored = Math.max(10, Math.floor(n / 10) * 10)
  return floored.toLocaleString() + "+"
}

function AnimatedCounter({ target }: { target: string }) {
  // Simple fade-in for the formatted string
  return <>{target}</>
}

export function Hero() {
  const [dealCount, setDealCount] = useState("...")

  useEffect(() => {
    fetch("/api/stats/deal-count")
      .then((r) => r.json())
      .then((d) => setDealCount(formatDealCount(d.count ?? 10)))
      .catch(() => setDealCount("10+"))
  }, [])

  return (
    <section className="relative overflow-hidden">
      {/* Grid background — dark mode only (light mode is plain white) */}
      <div
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(0.25 0.02 260 / 0.3) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.25 0.02 260 / 0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      {/* Radial glow — dark mode only */}
      <div className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(ellipse_at_center,oklch(0.75_0.15_190_/_0.08)_0%,transparent_70%)] dark:block" />

      <div className="relative mx-auto flex max-w-7xl flex-col items-center px-6 pb-24 pt-20 text-center md:pb-32 md:pt-28">
        {/* Animated Badge */}
        <motion.div
          initial={{ opacity: 0, y: -30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <Badge
            variant="outline"
            className="mb-6 gap-1.5 border-primary/30 bg-primary/5 px-3 py-1 text-primary"
          >
            <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="size-3" />
            </motion.div>
            AI-Powered Property Analysis
          </Badge>
        </motion.div>

        {/* Animated Headline */}
        <h1 className="max-w-4xl text-balance text-4xl font-bold tracking-tight text-foreground md:text-6xl lg:text-7xl">
          <HeroText text="Know Your Numbers" delay={0.4} />
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="mt-2"
          >
            Before You Invest
          </motion.div>
        </h1>

        {/* Animated Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl"
        >
          Analyse any UK property deal in seconds. Get instant SDLT calculations,
          rental yield, cash flow projections, and AI-powered investment insights
          that help you make smarter decisions.
        </motion.p>

        {/* Animated Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex flex-col items-center gap-4 sm:flex-row"
        >
          <PulseElement>
            <Button asChild size="xl">
              <Link href="/analyse">
                Analyse a Deal
                <motion.span
                  animate={{ x: [0, 5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ArrowRight className="size-4 ml-2" />
                </motion.span>
              </Link>
            </Button>
          </PulseElement>
          
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button asChild variant="outline" size="lg">
              <a href="#features">See How It Works</a>
            </Button>
          </motion.div>
        </motion.div>

        {/* Product mockup showcase */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 2.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-16 w-full max-w-5xl"
        >
          <DashboardMockup />
        </motion.div>

        {/* Animated Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 2.4, ease: [0.22, 1, 0.36, 1] }}
          className="mt-20 grid w-full max-w-3xl grid-cols-1 gap-8 rounded-xl border border-border/50 bg-card/50 px-8 py-6 backdrop-blur-sm sm:grid-cols-3"
        >
          {[
            { value: <AnimatedCounter target={dealCount} />, label: "Deals Analysed" },
            { value: "98%", label: "Calculation Accuracy" },
            { value: "4+ hrs", label: "Saved Per Deal" },
          ].map((stat, i) => (
            <motion.div
              key={i}
              className="flex flex-col items-center gap-1"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 2.6 + i * 0.2 }}
              whileHover={{ scale: 1.05, y: -5 }}
            >
              <span className="text-2xl font-bold text-foreground md:text-3xl">
                {stat.value}
              </span>
              <span className="text-sm text-muted-foreground">{stat.label}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="flex flex-col items-center gap-2"
          >
            <span className="text-xs text-muted-foreground">Scroll to explore</span>
            <motion.div className="h-8 w-5 rounded-full border-2 border-border flex justify-center pt-2">
              <motion.div
                animate={{ y: [0, 8, 0], opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                className="h-1.5 w-1.5 rounded-full bg-primary"
              />
            </motion.div>
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
