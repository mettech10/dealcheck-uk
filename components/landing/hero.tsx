"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  Receipt,
} from "lucide-react"
import { motion } from "framer-motion"
import { useEffect, useState } from "react"

/** Format a deal count for display — floor to nearest 10 with "+" suffix */
function formatDealCount(n: number): string {
  const floored = Math.max(10, Math.floor(n / 10) * 10)
  return floored.toLocaleString() + "+"
}

export function Hero() {
  const [dealCount, setDealCount] = useState("10+")

  useEffect(() => {
    fetch("/api/stats/deal-count")
      .then((r) => r.json())
      .then((d) => setDealCount(formatDealCount(d.count ?? 10)))
      .catch(() => setDealCount("10+"))
  }, [])

  return (
    <section className="relative overflow-hidden border-b border-border/60">
      {/* Very subtle grid — dark mode only, low contrast */}
      <div
        className="pointer-events-none absolute inset-0 hidden opacity-60 dark:block"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(0.22 0.02 260 / 0.25) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.22 0.02 260 / 0.25) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
        }}
      />

      <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 pb-24 pt-20 text-center md:pt-28">
        {/* Eyebrow — clean, no sparkle cliché */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
        >
          UK Property Investment Analysis
        </motion.p>

        {/* Headline — solid, confident, one accent word */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="max-w-3xl text-balance text-4xl font-semibold tracking-tight text-foreground md:text-6xl md:leading-[1.05]"
        >
          Know your numbers before you invest
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg"
        >
          Analyse any UK property deal in seconds. Stamp duty, rental yield,
          cash flow and AI-backed insight, all in one report.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Button asChild size="xl" className="group">
            <Link href="/analyse">
              Analyse a deal
              <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="xl">
            <a href="#features">See how it works</a>
          </Button>
        </motion.div>

        {/* Trust line */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"
        >
          <CheckCircle2 className="size-4 text-[var(--success)]" />
          <span>
            <span className="font-semibold text-foreground">{dealCount}</span>{" "}
            deals analysed · No card required
          </span>
        </motion.p>

        {/* ── Product mockup ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-20 w-full max-w-4xl"
        >
          <DashboardMockup />

          {/* Static callout — net yield (top-left). No bobbing. */}
          <motion.div
            initial={{ opacity: 0, x: -16, y: 8 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="absolute top-24 hidden w-40 rounded-xl border border-border bg-card p-4 text-left shadow-lg lg:-left-32 lg:block xl:-left-40"
          >
            <p className="text-[11px] font-medium text-muted-foreground">
              Net rental yield
            </p>
            <p className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">
              6.4%
            </p>
            <div className="mt-3 flex items-end gap-1">
              {[44, 52, 48, 66, 60, 82].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-[2px] bg-primary"
                  style={{ height: `${h * 0.28}px` }}
                />
              ))}
            </div>
          </motion.div>

          {/* Static callout — cash flow (bottom-right). No bobbing. */}
          <motion.div
            initial={{ opacity: 0, x: 16, y: -8 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.6, delay: 0.95 }}
            className="absolute bottom-20 hidden w-44 rounded-xl border border-border bg-card p-4 text-left shadow-lg lg:-right-32 lg:block xl:-right-40"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-[var(--success)]" />
              <p className="text-[11px] font-medium text-muted-foreground">
                Monthly cash flow
              </p>
            </div>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-[var(--success)]">
              +£412
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

/* ── Central dashboard mockup ─────────────────────────────────────────
   A faux Metalyzi deal-analysis screen, built from theme tokens so it
   reads correctly in light and dark. Flat fills, no gradients — keeps it
   looking like a real product UI rather than a generated illustration. */
function DashboardMockup() {
  const metrics = [
    { label: "Purchase price", value: "£285,000" },
    { label: "Net yield", value: "6.4%" },
    { label: "Cash flow / mo", value: "+£412", tone: "text-[var(--success)]" },
    { label: "ROI (year 1)", value: "11.2%" },
  ]
  const projection = [38, 50, 61, 74, 88]

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card text-left shadow-xl ring-1 ring-black/5 dark:ring-white/5">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <div className="ml-3 flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-1">
          <span className="text-[11px] text-muted-foreground">
            metalyzi.com/analyse
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="grid gap-5 p-5 md:grid-cols-5 md:p-7">
        {/* Left: property summary + verdict */}
        <div className="md:col-span-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Deal analysis
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            14 Oakfield Road
          </h3>
          <p className="text-sm text-muted-foreground">Manchester M20 · BTL</p>

          {/* Score ring */}
          <div className="mt-5 flex items-center gap-4 rounded-xl border border-border bg-background p-4">
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
              <span className="absolute text-lg font-semibold text-foreground">
                82
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--success)]">
                Strong buy
              </p>
              <p className="text-xs text-muted-foreground">
                Healthy yield, positive cash flow.
              </p>
            </div>
          </div>

          {/* SDLT line item */}
          <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <Receipt className="size-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Stamp duty (SDLT)
              </span>
            </div>
            <span className="text-sm font-semibold text-foreground">
              £11,750
            </span>
          </div>
        </div>

        {/* Right: metrics grid + projection chart */}
        <div className="md:col-span-3">
          <div className="grid grid-cols-2 gap-3">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-border bg-background p-3"
              >
                <p className="text-[11px] text-muted-foreground">{m.label}</p>
                <p
                  className={`mt-1 text-lg font-semibold tracking-tight ${m.tone ?? "text-foreground"}`}
                >
                  {m.value}
                </p>
              </div>
            ))}
          </div>

          {/* 5-year equity projection — flat solid bars */}
          <div className="mt-3 rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground">
                5-year equity projection
              </p>
              <span className="text-[11px] font-semibold text-[var(--success)]">
                +£64,200
              </span>
            </div>
            <div className="mt-3 flex h-20 items-end gap-2">
              {projection.map((h, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className="w-full rounded-[3px] bg-primary"
                    style={{ height: `${h}%` }}
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
