"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Check, Sparkles } from "lucide-react"
import { motion } from "framer-motion"
import { HeroText, PulseElement } from "@/components/animations"
import { HeroMosaic } from "@/components/landing/hero-mosaic"

export function Hero() {
  return (
    <section className="hero-section relative overflow-hidden">
      {/* Grid background — dark mode only (light is the clean gradient). */}
      <div className="hero-grid pointer-events-none absolute inset-0 hidden dark:block" />
      {/* Radial glow — dark mode only (mosaic carries its own glow in light). */}
      <div className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(ellipse_at_center,oklch(0.75_0.15_190_/_0.08)_0%,transparent_70%)] dark:block" />

      <div className="relative mx-auto flex max-w-7xl flex-col items-center px-6 pb-20 pt-16 text-center md:pt-24">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <Badge
            variant="outline"
            className="mb-6 gap-1.5 border-[#c8d8f0] bg-[#e8f0fe] px-3 py-1 text-[#0a1f4e] dark:border-[var(--brand-teal)]/30 dark:bg-[var(--brand-teal)]/10 dark:text-[var(--brand-teal)]"
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

        {/* Headline */}
        <h1 className="max-w-4xl text-balance text-4xl font-bold tracking-tight text-foreground md:text-6xl lg:text-7xl">
          <HeroText text="Know Your Numbers" delay={0.25} />
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="mt-2 text-[var(--brand-teal)]"
          >
            Before You Invest
          </motion.div>
        </h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl"
        >
          Stop guessing. Get instant AI-powered yield, cashflow, risk scores and
          market comparables for every investment strategy — BTL, HMO, BRRRR, SA
          and more.
        </motion.p>

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row"
        >
          <PulseElement>
            <Button asChild size="xl" className="w-full sm:w-auto">
              <Link href="/analyse">
                Analyse a Deal Free
                <motion.span
                  animate={{ x: [0, 5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ArrowRight className="ml-2 size-4" />
                </motion.span>
              </Link>
            </Button>
          </PulseElement>

          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="w-full sm:w-auto">
            <Button asChild variant="outline" size="xl" className="w-full sm:w-auto">
              <a href="#how-it-works">See How It Works</a>
            </Button>
          </motion.div>
        </motion.div>

        {/* Trust line */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.8, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
        >
          {["No card required", "3 free analyses/month", "All 6 strategies"].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <Check className="size-4 text-[var(--brand-teal)]" />
              {t}
            </span>
          ))}
        </motion.div>

        {/* Floating dashboard mosaic */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 2.1, ease: [0.22, 1, 0.36, 1] }}
          className="w-full"
        >
          <HeroMosaic />
        </motion.div>
      </div>
    </section>
  )
}
