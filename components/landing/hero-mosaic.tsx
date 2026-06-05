"use client"

/**
 * Hero "floating dashboard mosaic" — a STATIC, hardcoded showcase of real
 * Metalyzi result components (deal-score dial, metric pills, 5-year
 * projection line chart, capital-cost donut, monthly cashflow bars).
 *
 * No live data, no calculation engine — purely a marketing visual for the
 * landing hero. Theme-aware via tokens so it reads in light and dark.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"
import { TrendingUp, Wallet, PiggyBank, Percent } from "lucide-react"

const TEAL = "#2dd4bf"
const GREEN = "#10b981"
const AMBER = "#f59e0b"
const PURPLE = "#8b5cf6"
const INDIGO = "#6366f1"

// ── Card 1 — Deal Score dial ────────────────────────────────────────────
function DemoScoreDial() {
  const score = 74
  const size = 150
  const stroke = 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const progress = (score / 100) * c
  return (
    <div className="mosaic-card card-score mosaic-float-a flex flex-col items-center gap-3 p-6">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={TEAL}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${progress} ${c}`}
          />
        </svg>
        <div className="absolute flex flex-col items-center leading-none">
          <span className="text-4xl font-bold text-foreground">{score}</span>
          <span className="mt-1 text-xs text-muted-foreground">/100</span>
        </div>
      </div>
      <span className="text-sm font-semibold text-[var(--brand-teal)]">Good Deal</span>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="text-sm font-medium text-foreground">24 Victoria Street, M14</span>
        <span className="text-xs text-muted-foreground">BTL Analysis · Rightmove</span>
      </div>
    </div>
  )
}

// ── Card 2 — Metric pills ───────────────────────────────────────────────
function MetricPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: string
  tone: string
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card p-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-teal)]/15">
        <Icon className="size-4 text-[var(--brand-teal)]" />
      </div>
      <div className="flex flex-col">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="text-base font-semibold" style={{ color: tone }}>
          {value}
        </span>
      </div>
    </div>
  )
}

function DemoMetricCards() {
  return (
    <div className="mosaic-card card-metrics mosaic-float-b flex flex-col gap-3 p-5">
      <span className="text-sm font-semibold text-foreground">Headline Metrics</span>
      <div className="grid grid-cols-2 gap-2.5">
        <MetricPill icon={Percent} label="Gross Yield" value="6.91%" tone={GREEN} />
        <MetricPill icon={TrendingUp} label="Net Yield" value="3.84%" tone={AMBER} />
        <MetricPill icon={Wallet} label="Cash Flow" value="+£247/mo" tone={GREEN} />
        <MetricPill icon={PiggyBank} label="ROI" value="14.2%" tone={TEAL} />
      </div>
    </div>
  )
}

// ── Card 3 — 5-year projection line chart ───────────────────────────────
const projectionData = [
  { year: "Year 1", equity: 46500, cashflow: 2964, total: 49464 },
  { year: "Year 2", equity: 52440, cashflow: 6021, total: 58461 },
  { year: "Year 3", equity: 58603, cashflow: 9184, total: 67787 },
  { year: "Year 4", equity: 65003, cashflow: 12459, total: 77462 },
  { year: "Year 5", equity: 71651, cashflow: 15851, total: 87502 },
]

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function DemoProjectionChart() {
  return (
    <div className="mosaic-card card-projection flex flex-col gap-2 p-5">
      <div>
        <span className="text-sm font-semibold text-foreground">5-Year Projection</span>
        <p className="text-xs text-muted-foreground">24 Victoria Street, M14 · BTL</p>
      </div>
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={projectionData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="year" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `£${Math.round(v / 1000)}k`}
              width={38}
            />
            <Line type="monotone" dataKey="equity" stroke={TEAL} strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="cashflow" stroke={GREEN} strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="total" stroke={AMBER} strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        <LegendDot color={TEAL} label="Equity" />
        <LegendDot color={GREEN} label="Cumulative Cash Flow" />
        <LegendDot color={AMBER} label="Total Return" />
      </div>
    </div>
  )
}

// ── Card 4 — Capital cost donut ─────────────────────────────────────────
const costData = [
  { name: "Deposit", value: 41250, color: TEAL },
  { name: "SDLT", value: 9050, color: GREEN },
  { name: "Legal", value: 1500, color: AMBER },
  { name: "Survey", value: 500, color: INDIGO },
]

function DemoCostDonut() {
  return (
    <div className="mosaic-card card-donut flex flex-col gap-2 p-5">
      <div>
        <span className="text-sm font-semibold text-foreground">Capital Cost Breakdown</span>
        <p className="text-xs text-muted-foreground">Total capital required</p>
      </div>
      <div className="relative mx-auto h-[160px] w-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={costData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={75}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {costData.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-bold text-foreground">£52,300</span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {costData.map((d) => (
          <div key={d.name} className="flex items-center justify-between text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: d.color }} />
              {d.name}
            </span>
            <span className="font-medium text-foreground">£{d.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Card 5 — Monthly cashflow bars ──────────────────────────────────────
const cashflowData = [{ name: "Monthly", income: 950, mortgage: 625, costs: 78 }]

function DemoCashflowChart() {
  return (
    <div className="mosaic-card card-cashflow flex flex-col gap-2 p-5">
      <div>
        <span className="text-sm font-semibold text-foreground">Monthly Cash Flow</span>
        <p className="text-xs text-muted-foreground">Income vs expenses</p>
      </div>
      <div className="h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={cashflowData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `£${v}`}
              width={38}
            />
            <Bar dataKey="income" fill={TEAL} radius={[4, 4, 0, 0]} />
            <Bar dataKey="mortgage" fill={AMBER} radius={[4, 4, 0, 0]} />
            <Bar dataKey="costs" fill={PURPLE} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        <LegendDot color={TEAL} label="Income" />
        <LegendDot color={AMBER} label="Mortgage" />
        <LegendDot color={PURPLE} label="Running Costs" />
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-border/60 pt-2 text-xs">
        <span className="text-muted-foreground">Net Monthly</span>
        <span className="font-bold" style={{ color: GREEN }}>+£247</span>
      </div>
      <p className="text-[11px] text-muted-foreground">✓ Article 4: None · ✓ 8 comparables found</p>
    </div>
  )
}

export function HeroMosaic() {
  return (
    <div className="relative mt-8 w-full md:mt-12">
      {/* Teal radial glow behind the mosaic */}
      <div className="hero-mosaic-glow pointer-events-none absolute inset-0 -z-10" />
      <div className="hero-mosaic mx-auto max-w-5xl">
        <div className="card-score-wrap">
          <DemoScoreDial />
        </div>
        <div className="card-metrics-wrap">
          <DemoMetricCards />
        </div>
        <div className="card-projection-wrap">
          <DemoProjectionChart />
        </div>
        <div className="card-donut-wrap">
          <DemoCostDonut />
        </div>
        <div className="card-cashflow-wrap">
          <DemoCashflowChart />
        </div>
      </div>
    </div>
  )
}
