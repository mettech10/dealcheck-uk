import Link from "next/link"
import { ArrowRight, Sparkles, ShieldCheck, Zap } from "lucide-react"
import { V2AppPreview } from "./v2-app-preview"

export function V2Hero() {
  return (
    <section className="relative">
      <div className="v2-ambient" />
      {/* Slow-drifting colour fields — the page feels alive without anything
          moving fast enough to distract from the copy. */}
      <div className="v2-aurora" aria-hidden>
        <i className="a1" />
        <i className="a2" />
        <i className="a3" />
      </div>
      <div className="v2-grid" />

      <div className="v2-container relative z-[1] pb-16 pt-16 md:pb-24 md:pt-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="v2-pill v2-rise" style={{ animationDelay: "60ms" }}>
            <Sparkles size={13} strokeWidth={1.5} style={{ color: "var(--v2-brand)" }} />
            AI-powered property analysis
          </div>

          <h1 className="v2-display v2-rise mt-7" style={{ animationDelay: "140ms" }}>
            Know your numbers
            <br />
            <span className="v2-gradient-text">before you invest.</span>
          </h1>

          <p
            className="v2-rise mx-auto mt-6 max-w-xl text-[1.0625rem] leading-relaxed"
            style={{ color: "var(--v2-text-muted)", animationDelay: "220ms" }}
          >
            Analyse any UK property deal in seconds. SDLT, mortgage costs, rental yield, cash flow
            and an AI deal score — in one place, before you commit a penny.
          </p>

          <div
            className="v2-rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ animationDelay: "300ms" }}
          >
            <Link href="/analyse" className="v2-btn v2-btn-primary w-full sm:w-auto">
              Analyse a deal free
              <ArrowRight size={16} strokeWidth={1.75} />
            </Link>
            <Link href="#product" className="v2-btn v2-btn-ghost w-full sm:w-auto">
              See how it works
            </Link>
          </div>

          <div
            className="v2-rise mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[0.8125rem]"
            style={{ color: "var(--v2-text-dim)", animationDelay: "380ms" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={14} strokeWidth={1.5} /> No card required
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap size={14} strokeWidth={1.5} /> Results in under 60s
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles size={14} strokeWidth={1.5} /> 3 free deals a month
            </span>
          </div>
        </div>

        {/* Product preview */}
        <div className="v2-rise mt-16 md:mt-20" style={{ animationDelay: "460ms" }}>
          <V2AppPreview />
        </div>
      </div>
    </section>
  )
}
