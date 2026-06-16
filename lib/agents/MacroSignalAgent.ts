/**
 * MacroSignalAgent (Section 5) — watches the macro backdrop (BoE base rate).
 *
 * Daily, it reads the Bank of England's official Bank Rate series (IUDBEDR)
 * from the IADB CSV feed and compares it to the rate we last stored in
 * platform_benchmarks ('boe_base_rate'). When the rate actually changes it
 * records a UK-wide deal pattern (rate_increased / rate_decreased, strategy
 * null) and emails the admin. No change → it just refreshes the stored value's
 * timestamp. It never throws into the platform: any fetch/parse problem simply
 * results in "no signal this run".
 */
import { BaseAgent, type AgentResult } from "./BaseAgent"

const USER_AGENT = "Metalyzi Property Intelligence Bot 1.0 (+https://metalyzi.co.uk)"
const BENCHMARK = "boe_base_rate"
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

type Loose = Record<string, unknown>

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

export class MacroSignalAgent extends BaseAgent {
  constructor() {
    super("MacroSignalAgent", "0 8 * * *") // 8am daily
  }

  async execute(): Promise<AgentResult> {
    const insights: string[] = []

    const current = await this.fetchBaseRate()
    if (current === null) {
      return { itemsProcessed: 0, insights: ["Could not read BoE base rate this run"] }
    }

    // Last value we stored.
    const { data: prevRow } = await this.supabase
      .from("platform_benchmarks")
      .select("metric_value")
      .eq("metric_name", BENCHMARK)
      .maybeSingle()
    const previous = prevRow ? num((prevRow as Loose).metric_value) : null

    // Always keep the stored benchmark fresh.
    await this.supabase.from("platform_benchmarks").upsert(
      {
        metric_name: BENCHMARK,
        metric_value: current,
        metric_type: "macro",
        last_calculated: new Date().toISOString(),
      },
      { onConflict: "metric_name" },
    )

    // First observation — nothing to compare against yet.
    if (previous === null) {
      return { itemsProcessed: 1, insights: [`Recorded BoE base rate at ${current.toFixed(2)}%`] }
    }

    if (Math.abs(current - previous) < 0.01) {
      return { itemsProcessed: 1, insights: [] } // unchanged
    }

    const rising = current > previous
    const move = `${previous.toFixed(2)}% → ${current.toFixed(2)}%`
    insights.push(`BoE base rate ${rising ? "increased" : "decreased"}: ${move}`)

    await this.recordPattern({
      pattern_type: rising ? "rate_increased" : "rate_decreased",
      strategy: null, // macro signal applies platform-wide
      postcode_area: "UK",
      description: `Bank of England base rate ${rising ? "rose" : "fell"} (${move}).`,
      insight: rising
        ? "Higher base rate lifts mortgage costs, squeezing leveraged cashflow and softening buyer demand."
        : "Lower base rate eases mortgage costs, supporting leveraged cashflow and buyer demand.",
      recommendation: rising
        ? "Stress-test deals at the higher rate; favour higher-yield strategies (e.g. HMO) and lower LTVs."
        : "Re-check affordability headroom; improving finance costs may unlock more deals.",
      trigger_conditions: { base_rate: current, previous_rate: previous },
      confidence: 0.9,
    })

    await this.sendRateAlert(previous, current, rising)
    return { itemsProcessed: 1, insights }
  }

  /** Fetch the latest BoE Bank Rate (IUDBEDR) from the IADB CSV feed. */
  private async fetchBaseRate(): Promise<number | null> {
    try {
      const to = new Date()
      const from = new Date(to.getTime())
      from.setFullYear(from.getFullYear() - 1) // a year of data; we want the last point
      const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${MONTHS[d.getMonth()]}/${d.getFullYear()}`

      const url =
        "https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp" +
        `?csv.x=yes&Datefrom=${encodeURIComponent(fmt(from))}&Dateto=${encodeURIComponent(fmt(to))}` +
        "&SeriesCodes=IUDBEDR&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N"

      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "text/csv,text/plain,*/*" },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) return null
      const csv = await res.text()
      return this.parseLatestRate(csv)
    } catch {
      return null
    }
  }

  /** Take the last plausible rate (0–25%) value from the CSV's value column. */
  private parseLatestRate(csv: string): number | null {
    const lines = csv.trim().split(/\r?\n/)
    let latest: number | null = null
    for (const line of lines) {
      const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim())
      if (cols.length < 2) continue
      const v = Number(cols[cols.length - 1])
      if (Number.isFinite(v) && v >= 0 && v <= 25) latest = v
    }
    return latest
  }

  private async sendRateAlert(previous: number, current: number, rising: boolean): Promise<void> {
    const subject = `[Metalyzi] BoE base rate ${rising ? "increased" : "decreased"}: ${previous.toFixed(2)}% → ${current.toFixed(2)}%`
    const html = `
      <h2>Bank of England base rate changed</h2>
      <p>The Macro Signal agent detected a change in the official Bank Rate (IUDBEDR).</p>
      <table cellpadding="6" style="border-collapse:collapse">
        <tr><td><strong>Previous</strong></td><td>${previous.toFixed(2)}%</td></tr>
        <tr><td><strong>Current</strong></td><td>${current.toFixed(2)}%</td></tr>
        <tr><td><strong>Direction</strong></td><td>${rising ? "↑ increase" : "↓ decrease"}</td></tr>
      </table>
      <p>A UK-wide <code>${rising ? "rate_increased" : "rate_decreased"}</code> pattern has been
      recorded in the intelligence layer and will inform future deal analysis.</p>
    `
    await this.sendAdminEmail(subject, html)
  }
}
