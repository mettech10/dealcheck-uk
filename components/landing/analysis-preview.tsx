/**
 * Hero product preview — a stylised Metalyzi analysis result.
 *
 * Same card as the /v2 concept, rebuilt on the app's own design tokens so it
 * works in BOTH themes: accents use --primary (teal in dark, navy in light),
 * surfaces use card/border/muted-foreground. Pure CSS + SVG — no screenshot —
 * so it stays crisp at any size and follows the theme automatically.
 *
 * The figures are illustrative sample output, deliberately realistic.
 */
import { Sparkles, TrendingUp, Wallet, PieChart, Receipt } from "lucide-react"

const METRICS = [
  { icon: TrendingUp, label: "Gross yield", value: "7.4%", note: "+1.2% vs area", accent: true },
  { icon: Wallet, label: "Monthly cashflow", value: "£412", note: "after all costs", accent: true },
  { icon: PieChart, label: "Cash-on-cash ROI", value: "11.2%", note: "year one", accent: true },
  { icon: Receipt, label: "SDLT payable", value: "£8,750", note: "incl. 5% surcharge", accent: false },
]

/** 5-year projected cashflow — smooth area chart. */
const POINTS = [22, 34, 30, 46, 52, 49, 63, 71, 68, 82]

function Sparkline() {
  const w = 560
  const h = 132
  const max = 92
  const step = w / (POINTS.length - 1)
  const coords = POINTS.map((p, i) => [i * step, h - (p / max) * h] as const)
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ")
  const area = `${line} L${w},${h} L0,${h} Z`
  const last = coords[coords.length - 1]

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[132px] w-full" preserveAspectRatio="none">
      <defs>
        {/* CSS vars via style so they resolve in both themes */}
        <linearGradient id="mz-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--primary)", stopOpacity: 0.3 }} />
          <stop offset="100%" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#mz-fill)" />
      <path
        d={line}
        fill="none"
        style={{ stroke: "var(--primary)" }}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx={last[0] - 1} cy={last[1]} r="3.5" style={{ fill: "var(--primary)" }} />
    </svg>
  )
}

function ScoreRing({ score = 84 }: { score?: number }) {
  const r = 46
  const circumference = 2 * Math.PI * r
  const filled = (score / 100) * circumference
  return (
    <div className="relative grid place-items-center">
      <svg width="116" height="116" viewBox="0 0 116 116" className="-rotate-90">
        <circle
          cx="58"
          cy="58"
          r={r}
          fill="none"
          className="stroke-border"
          strokeWidth="7"
          opacity="0.6"
        />
        <circle
          cx="58"
          cy="58"
          r={r}
          fill="none"
          style={{ stroke: "var(--primary)" }}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-[1.75rem] font-semibold leading-none tracking-tight text-foreground">
          {score}
        </div>
        <div className="mt-1 text-[0.6875rem] text-muted-foreground">Deal score</div>
      </div>
    </div>
  )
}

export function AnalysisPreview() {
  return (
    <div className="relative mx-auto w-full max-w-5xl text-left">
      {/* Soft glow pooled beneath the panel — depth without a hard shadow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 -bottom-10 top-10 -z-10 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 40%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 70%)",
        }}
      />

      <div className="overflow-hidden rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm">
        {/* Window chrome */}
        <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-muted-foreground/25" />
            <span className="size-2.5 rounded-full bg-muted-foreground/25" />
            <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          </div>
          <div className="mx-auto hidden min-w-[260px] items-center justify-center rounded-md border border-border/50 bg-background/50 px-3 py-1 text-xs text-muted-foreground sm:flex">
            metalyzi.co.uk/analyse
          </div>
        </div>

        {/* Body */}
        <div className="p-5 md:p-7">
          {/* Address row */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Analysis complete
              </div>
              <div className="mt-1.5 text-base font-semibold tracking-tight text-foreground">
                14 Beresford Road, Manchester M13
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                3 bed terraced · £215,000 asking · HMO strategy
              </div>
            </div>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Strong buy
            </span>
          </div>

          {/* Metrics + score */}
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
            <div className="grid grid-cols-2 gap-3">
              {METRICS.map((m) => {
                const Icon = m.icon
                return (
                  <div
                    key={m.label}
                    className="rounded-lg border border-border/50 bg-background/40 p-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="size-3.5 text-primary" strokeWidth={1.5} />
                      <span className="text-xs text-muted-foreground">{m.label}</span>
                    </div>
                    <div className="mt-2 text-[1.375rem] font-semibold tracking-tight text-foreground">
                      {m.value}
                    </div>
                    <div
                      className={`mt-0.5 text-[0.6875rem] ${
                        m.accent ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {m.note}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="grid place-items-center rounded-lg border border-border/50 bg-background/40 px-8 py-6">
              <ScoreRing />
            </div>
          </div>

          {/* Chart */}
          <div className="mt-4 overflow-hidden rounded-lg border border-border/50 bg-background/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">5-year cashflow projection</span>
              <span className="text-xs text-muted-foreground">incl. 3% rent growth</span>
            </div>
            <Sparkline />
          </div>

          {/* AI insight */}
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
              <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="text-foreground">AI insight — </span>
              Yield sits 1.2% above the M13 median and cashflow stays positive at 6.5% interest.
              Check Article 4 status before committing to an HMO conversion.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
