import {
  Search,
  Calculator,
  TrendingUp,
  Wallet,
  PieChart,
  Sparkles,
  Home,
  Link2,
  FileText,
  ShieldAlert,
} from "lucide-react"

/* ── Trust / stat band ─────────────────────────────────────────────────── */

const STATS = [
  { value: "60s", label: "Average time to a full deal analysis" },
  { value: "20+", label: "Metrics computed per property" },
  { value: "3", label: "Free deals every month, no card" },
  { value: "24", label: "UK districts with live intelligence" },
]

export function V2Stats() {
  return (
    <section className="v2-section !py-0">
      <div className="v2-container">
        <hr className="v2-rule" />
        <div className="grid grid-cols-2 gap-y-8 py-12 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="px-2 text-center md:text-left">
              <div className="v2-gradient-text text-[2rem] font-semibold tracking-tight md:text-[2.35rem]">
                {s.value}
              </div>
              <p
                className="mx-auto mt-1.5 max-w-[190px] text-[0.8125rem] leading-snug md:mx-0"
                style={{ color: "var(--v2-text-dim)" }}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>
        <hr className="v2-rule" />
      </div>
    </section>
  )
}

/* ── Feature bento ─────────────────────────────────────────────────────── */

function Card({
  icon: Icon,
  title,
  children,
  className = "",
  span = "col-span-12",
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  title: string
  children: React.ReactNode
  className?: string
  span?: string
}) {
  return (
    <article className={`v2-card v2-topline overflow-hidden p-6 ${span} ${className}`}>
      <span className="v2-icon">
        <Icon size={17} strokeWidth={1.5} />
      </span>
      <h3 className="mt-4 text-[1.0625rem] font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-[0.875rem] leading-relaxed" style={{ color: "var(--v2-text-muted)" }}>
        {children}
      </p>
    </article>
  )
}

export function V2Bento() {
  return (
    <section id="product" className="v2-section">
      <div className="v2-container">
        <div className="mx-auto max-w-2xl text-center">
          <div className="v2-eyebrow">Built for UK investors</div>
          <h2 className="v2-h2 mt-3">
            Everything you need to
            <br />
            <span className="v2-gradient-text">evaluate a deal.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[1rem] leading-relaxed" style={{ color: "var(--v2-text-muted)" }}>
            From stamp duty to AI-powered insight — a complete picture of any UK property
            investment, computed the moment you paste a listing.
          </p>
        </div>

        <div className="v2-grid12 mt-14">
          {/* Row 1 — hero feature + discovery */}
          <article className="v2-card v2-topline relative col-span-12 overflow-hidden p-6 md:p-8 lg:col-span-7">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full blur-3xl"
              style={{ background: "radial-gradient(circle, rgba(0,203,195,0.16), transparent 70%)" }}
            />
            <span className="v2-icon">
              <Sparkles size={17} strokeWidth={1.5} />
            </span>
            <h3 className="mt-4 text-[1.25rem] font-semibold tracking-tight">
              AI deal score, not just a spreadsheet
            </h3>
            <p className="mt-2 max-w-md text-[0.9375rem] leading-relaxed" style={{ color: "var(--v2-text-muted)" }}>
              Every analysis returns a score out of 100 with the strengths, the risks and a plain-English
              recommendation — grounded in what the platform has learned from deals in that postcode.
            </p>

            {/* Score bars */}
            <div className="mt-6 space-y-3">
              {[
                { label: "Yield vs area median", pct: 86 },
                { label: "Cashflow resilience", pct: 72 },
                { label: "Capital growth outlook", pct: 64 },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-[0.75rem]">
                    <span style={{ color: "var(--v2-text-muted)" }}>{row.label}</span>
                    <span style={{ color: "var(--v2-text-dim)" }}>{row.pct}</span>
                  </div>
                  <div
                    className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${row.pct}%`,
                        background: "linear-gradient(90deg, #0d9488, #32d3d9)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <Card icon={Search} title="Deal discovery" span="col-span-12 lg:col-span-5">
            Scan a whole postcode area at once. Every listing is screened against area data, and the
            strongest candidates get a full analysis and a ranked shortlist.
          </Card>

          {/* Row 2 — the calculators */}
          <Card icon={Calculator} title="SDLT calculator" span="col-span-12 md:col-span-6 lg:col-span-4">
            Accurate stamp duty for England &amp; NI, including the 5% additional property surcharge
            for buy-to-let investors.
          </Card>
          <Card icon={TrendingUp} title="Rental yield" span="col-span-12 md:col-span-6 lg:col-span-4">
            Gross and net yields computed instantly, factoring in void periods, management fees and
            every running cost.
          </Card>
          <Card icon={Wallet} title="Cash flow projection" span="col-span-12 md:col-span-6 lg:col-span-4">
            Monthly and annual cash flow after all expenses, with 5-year projections for rent and
            capital growth.
          </Card>

          {/* Row 3 */}
          <Card icon={Home} title="Mortgage costs" span="col-span-12 md:col-span-6 lg:col-span-4">
            Repayment or interest-only, with customisable rates, terms and deposit percentages —
            stress-tested against rate rises.
          </Card>
          <Card icon={PieChart} title="ROI analysis" span="col-span-12 md:col-span-6 lg:col-span-4">
            Cash-on-cash returns, total capital required, and a full breakdown of every cost from
            SDLT to refurbishment.
          </Card>
          <Card icon={ShieldAlert} title="Article 4 &amp; risk checks" span="col-span-12 md:col-span-6 lg:col-span-4">
            Know before you convert. Article 4 direction status is surfaced alongside the numbers so
            an HMO plan never blindsides you.
          </Card>
        </div>
      </div>
    </section>
  )
}

/* ── Workflow ──────────────────────────────────────────────────────────── */

const STEPS = [
  {
    icon: Link2,
    step: "01",
    title: "Paste a listing",
    body: "Drop in a Rightmove link or enter the numbers by hand. Address, price and bedrooms are pulled in automatically.",
  },
  {
    icon: Calculator,
    step: "02",
    title: "Set your strategy",
    body: "BTL, HMO, serviced accommodation, BRRRR, flip or development — each one is modelled on its own terms, not a generic template.",
  },
  {
    icon: FileText,
    step: "03",
    title: "Get the verdict",
    body: "A full breakdown, an AI deal score and an exportable PDF report you can take to a lender or a partner.",
  },
]

export function V2Workflow() {
  return (
    <section id="workflow" className="v2-section">
      <div className="v2-container">
        <div className="mx-auto max-w-2xl text-center">
          <div className="v2-eyebrow">How it works</div>
          <h2 className="v2-h2 mt-3">
            Three steps to a <span className="v2-gradient-text">confident decision.</span>
          </h2>
        </div>

        <div className="v2-grid12 mt-14">
          {STEPS.map((s) => {
            const Icon = s.icon
            return (
              <article key={s.step} className="v2-card v2-topline col-span-12 p-6 md:col-span-4">
                <div className="flex items-center justify-between">
                  <span className="v2-icon">
                    <Icon size={17} strokeWidth={1.5} />
                  </span>
                  <span
                    className="text-[2rem] font-semibold leading-none tracking-tight"
                    style={{ color: "rgba(255,255,255,0.07)" }}
                  >
                    {s.step}
                  </span>
                </div>
                <h3 className="mt-5 text-[1.0625rem] font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-[0.875rem] leading-relaxed" style={{ color: "var(--v2-text-muted)" }}>
                  {s.body}
                </p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
