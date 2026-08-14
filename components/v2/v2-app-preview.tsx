/**
 * Glass "product preview" for the hero — a stylised Metalyzi analysis result.
 * Pure CSS/SVG (no screenshots) so it stays crisp at any size and can be
 * restyled with the design tokens.
 */
import { Sparkles, TrendingUp, Wallet, PieChart, Receipt } from "lucide-react"

const METRICS = [
  { icon: TrendingUp, label: "Gross yield", value: "7.4%", delta: "+1.2% vs area", good: true },
  { icon: Wallet, label: "Monthly cashflow", value: "£412", delta: "after all costs", good: true },
  { icon: PieChart, label: "Cash-on-cash ROI", value: "11.2%", delta: "year one", good: true },
  { icon: Receipt, label: "SDLT payable", value: "£8,750", delta: "incl. 5% surcharge", good: false },
]

/** 5-year projected cashflow — smooth area chart. */
const POINTS = [22, 34, 30, 46, 52, 49, 63, 71, 68, 82]

function Sparkline() {
  const w = 560
  const h = 132
  const max = 92
  const step = w / (POINTS.length - 1)
  const coords = POINTS.map((p, i) => [i * step, h - (p / max) * h] as const)
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  const area = `${line} L${w},${h} L0,${h} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[132px] w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="v2fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00cbc3" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#00cbc3" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="v2stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#32d3d9" />
          <stop offset="100%" stopColor="#00cbc3" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#v2fill)" />
      <path d={line} fill="none" stroke="url(#v2stroke)" strokeWidth="2" strokeLinecap="round" />
      <circle cx={coords[coords.length - 1][0] - 1} cy={coords[coords.length - 1][1]} r="3.5" fill="#32d3d9" />
    </svg>
  )
}

function ScoreRing({ score = 84 }: { score?: number }) {
  const r = 46
  const c = 2 * Math.PI * r
  const filled = (score / 100) * c
  return (
    <div className="relative grid place-items-center">
      <svg width="116" height="116" viewBox="0 0 116 116" className="-rotate-90">
        <defs>
          <linearGradient id="v2ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#32d3d9" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
        </defs>
        <circle cx="58" cy="58" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle
          cx="58"
          cy="58"
          r={r}
          fill="none"
          stroke="url(#v2ring)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-[1.75rem] font-semibold leading-none tracking-tight">{score}</div>
        <div className="mt-1 text-[0.6875rem]" style={{ color: "var(--v2-text-dim)" }}>
          Deal score
        </div>
      </div>
    </div>
  )
}

export function V2AppPreview() {
  return (
    <div className="relative mx-auto max-w-5xl">
      {/* Glow pooled beneath the panel — depth without a hard shadow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 -bottom-10 top-10 -z-10 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 40%, rgba(0,203,195,0.16), transparent 70%), radial-gradient(50% 50% at 20% 60%, rgba(13, 148, 136, 0.14), transparent 70%)",
        }}
      />

      <div className="v2-glass relative overflow-hidden">
        <div className="v2-sweep" />

        {/* Window chrome */}
        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--v2-hairline)" }}
        >
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.14)" }} />
            <span className="size-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.14)" }} />
            <span className="size-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.14)" }} />
          </div>
          <div
            className="mx-auto hidden min-w-[260px] items-center justify-center gap-2 rounded-md px-3 py-1 text-[0.75rem] sm:flex"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--v2-hairline)",
              color: "var(--v2-text-dim)",
            }}
          >
            metalyzi.co.uk/analyse
          </div>
        </div>

        {/* Body */}
        <div className="p-5 md:p-7">
          {/* Address row */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="v2-eyebrow">Analysis complete</div>
              <div className="mt-1.5 text-[1.05rem] font-semibold tracking-tight">
                14 Beresford Road, Manchester M13
              </div>
              <div className="mt-1 text-[0.8125rem]" style={{ color: "var(--v2-text-dim)" }}>
                3 bed terraced · £215,000 asking · HMO strategy
              </div>
            </div>
            <span
              className="v2-pill"
              style={{
                color: "var(--v2-brand)",
                borderColor: "rgba(0,203,195,0.28)",
                background: "rgba(0,203,195,0.08)",
              }}
            >
              Strong buy
            </span>
          </div>

          {/* Metrics + score */}
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
            <div className="grid grid-cols-2 gap-3">
              {METRICS.map((m) => {
                const Icon = m.icon
                return (
                  <div key={m.label} className="v2-card p-3.5">
                    <div className="flex items-center gap-2">
                      <Icon size={14} strokeWidth={1.5} style={{ color: "var(--v2-brand)" }} />
                      <span className="text-[0.75rem]" style={{ color: "var(--v2-text-dim)" }}>
                        {m.label}
                      </span>
                    </div>
                    <div className="mt-2 text-[1.375rem] font-semibold tracking-tight">{m.value}</div>
                    <div
                      className="mt-0.5 text-[0.6875rem]"
                      style={{ color: m.good ? "var(--v2-brand)" : "var(--v2-text-dim)" }}
                    >
                      {m.delta}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="v2-card grid place-items-center px-8 py-6">
              <ScoreRing />
            </div>
          </div>

          {/* Chart */}
          <div className="v2-card mt-4 overflow-hidden p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[0.8125rem] font-medium">5-year cashflow projection</span>
              <span className="text-[0.75rem]" style={{ color: "var(--v2-text-dim)" }}>
                incl. 3% rent growth
              </span>
            </div>
            <Sparkline />
          </div>

          {/* AI insight */}
          <div
            className="mt-4 flex items-start gap-3 rounded-xl p-4"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,203,195,0.09), rgba(13, 148, 136, 0.06) 60%, transparent)",
              border: "1px solid rgba(0,203,195,0.18)",
            }}
          >
            <span className="v2-icon !size-8 shrink-0">
              <Sparkles size={14} strokeWidth={1.5} />
            </span>
            <p className="text-[0.8125rem] leading-relaxed" style={{ color: "var(--v2-text-muted)" }}>
              <span style={{ color: "var(--v2-text)" }}>AI insight — </span>
              Yield sits 1.2% above the M13 median and cashflow stays positive at 6.5% interest.
              Check Article 4 status before committing to an HMO conversion.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
