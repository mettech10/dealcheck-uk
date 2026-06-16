/**
 * Admin → Intelligence (Section 6)
 * ================================
 *
 * Shows what the platform has learned: the proprietary intelligence layer.
 * Already gated by app/admin/layout.tsx (auth + isAdminEmail), so this is a
 * plain server component that reads the four intelligence tables with the
 * service-role admin client.
 *
 * The "Model Sovereignty" panel proves the core point — the accumulated
 * intelligence above is independent of whichever AI model is configured.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { listAgents } from "@/lib/agents/orchestrator"

export const dynamic = "force-dynamic"

type Row = Record<string, unknown>

function n(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}
function pct(v: unknown): string {
  const x = n(v)
  return x === null ? "—" : `${x.toFixed(1)}%`
}

/** Human-readable label for an agent class name ("MarketPriceAgent" → "Market Price"). */
function agentLabel(name: string): string {
  return name.replace(/Agent$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").trim()
}

/** Plain-English cron schedule. */
function describeSchedule(cron: string): string {
  const map: Record<string, string> = {
    "0 3 1 * *": "Monthly · 1st · 03:00",
    "0 4 1 * *": "Monthly · 1st · 04:00",
    "0 6 * * 1": "Weekly · Mon · 06:00",
    "0 8 * * *": "Daily · 08:00",
    "0 2 * * 0": "Weekly · Sun · 02:00",
  }
  return map[cron] ?? cron
}

function timeAgo(iso: string): string {
  if (!iso) return "Never run"
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return "—"
  const mins = Math.floor((Date.now() - t) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

async function loadIntelligence() {
  const admin = createAdminClient()
  const empty = {
    areas: [] as Row[],
    patterns: [] as Row[],
    totalAnalyses: 0,
    areaCount: 0,
    patternCount: 0,
    profileCount: 0,
  }
  try {
    const [areasRes, allDealRes, patternsRes, patternCountRes, profileCountRes] = await Promise.all([
      admin
        .from("area_intelligence")
        .select("postcode_district, deal_count, median_btl_gross_yield, median_hmo_gross_yield, dominant_strategy, confidence_level")
        .order("deal_count", { ascending: false })
        .limit(50),
      admin.from("area_intelligence").select("deal_count"),
      admin
        .from("deal_patterns")
        .select("pattern_type, postcode_area, strategy, frequency, confidence")
        .eq("active", true)
        .order("frequency", { ascending: false })
        .limit(20),
      admin.from("deal_patterns").select("id", { count: "exact", head: true }).eq("active", true),
      admin.from("user_investor_profiles").select("id", { count: "exact", head: true }),
    ])
    const areas = (areasRes.data as Row[]) ?? []
    const totalAnalyses = ((allDealRes.data as Row[]) ?? []).reduce((s, r) => s + (n(r.deal_count) ?? 0), 0)
    return {
      areas,
      patterns: (patternsRes.data as Row[]) ?? [],
      totalAnalyses,
      areaCount: areas.length >= 50 ? (((allDealRes.data as Row[]) ?? []).length) : areas.length,
      patternCount: patternCountRes.count ?? 0,
      profileCount: profileCountRes.count ?? 0,
    }
  } catch {
    return empty
  }
}

interface AgentStatus {
  name: string
  schedule: string
  lastRun: string
  status: string
  itemsProcessed: number
}

async function loadAgentActivity() {
  const admin = createAdminClient()
  const registered = listAgents() // every agent, even those never run yet

  const empty = {
    statuses: registered.map((a) => ({
      name: a.name,
      schedule: a.schedule,
      lastRun: "",
      status: "pending",
      itemsProcessed: 0,
    })) as AgentStatus[],
    insights: [] as { agent: string; text: string; at: string }[],
    totalRuns: 0,
    signals: { baseRate: null as number | null, negativeFeedback: null as number | null, growthReadings: 0 },
  }

  try {
    const [logRes, benchRes] = await Promise.all([
      admin
        .from("agent_run_log")
        .select("agent, status, items_processed, insights, run_at")
        .order("run_at", { ascending: false })
        .limit(200),
      admin
        .from("platform_benchmarks")
        .select("metric_name, metric_value, metric_type")
        .in("metric_type", ["macro", "feedback", "price_growth"])
        .limit(100),
    ])

    const logs = (logRes.data as Row[]) ?? []

    // Latest run per agent name.
    const latest = new Map<string, Row>()
    for (const r of logs) {
      const a = String(r.agent ?? "")
      if (a && !latest.has(a)) latest.set(a, r)
    }

    const statuses: AgentStatus[] = registered.map((a) => {
      const last = latest.get(a.name)
      return {
        name: a.name,
        schedule: a.schedule,
        lastRun: last ? String(last.run_at ?? "") : "",
        status: last ? String(last.status ?? "—") : "pending",
        itemsProcessed: last ? n(last.items_processed) ?? 0 : 0,
      }
    })

    // Most recent insights across all agents (flattened, newest first).
    const insights: { agent: string; text: string; at: string }[] = []
    for (const r of logs) {
      const arr = Array.isArray(r.insights) ? (r.insights as unknown[]) : []
      for (const t of arr) {
        if (String(t).trim()) insights.push({ agent: String(r.agent ?? ""), text: String(t), at: String(r.run_at ?? "") })
      }
      if (insights.length >= 24) break
    }

    // Headline signals the agents have learned.
    const bench = (benchRes.data as Row[]) ?? []
    const baseRate = n(bench.find((b) => b.metric_name === "boe_base_rate")?.metric_value)
    const negativeFeedback = n(bench.find((b) => b.metric_name === "negative_feedback_30d")?.metric_value)
    const growthReadings = bench.filter((b) => b.metric_type === "price_growth").length

    return { statuses, insights: insights.slice(0, 16), totalRuns: logs.length, signals: { baseRate, negativeFeedback, growthReadings } }
  } catch {
    return empty
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#2A2D3E] bg-[#1A1D2E] p-4">
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{label}</div>
    </div>
  )
}

export default async function IntelligencePage() {
  const [data, activity] = await Promise.all([loadIntelligence(), loadAgentActivity()])
  const provider = process.env.AI_PROVIDER ?? "anthropic"
  const model = process.env.AI_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"
  const activeAgents = activity.statuses.filter((s) => s.status !== "pending").length

  return (
    <div className="flex flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold text-white">Platform Intelligence</h1>
        <p className="mt-1 text-sm text-slate-400">
          What Metalyzi has learned across every analysis — owned by Metusa Property Ltd, independent of the AI model.
        </p>
      </header>

      {/* Platform overview */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total analyses recorded" value={data.totalAnalyses.toLocaleString()} />
        <Stat label="Areas with intelligence" value={data.areaCount.toLocaleString()} />
        <Stat label="Active deal patterns" value={data.patternCount.toLocaleString()} />
        <Stat label="User profiles built" value={data.profileCount.toLocaleString()} />
        <Stat label="Agents active" value={`${activeAgents}/${activity.statuses.length}`} />
        <Stat label="Agent runs logged" value={activity.totalRuns.toLocaleString()} />
      </section>

      {/* Area intelligence */}
      <section className="rounded-lg border border-[#2A2D3E] bg-[#1A1D2E]">
        <div className="border-b border-[#2A2D3E] px-4 py-3 text-sm font-semibold text-white">
          Area Intelligence
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="px-4 py-2 font-medium">District</th>
                <th className="px-4 py-2 font-medium">Deals</th>
                <th className="px-4 py-2 font-medium">BTL Yield</th>
                <th className="px-4 py-2 font-medium">HMO Yield</th>
                <th className="px-4 py-2 font-medium">Dominant Strategy</th>
                <th className="px-4 py-2 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {data.areas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No area intelligence yet — it accumulates as analyses run.
                  </td>
                </tr>
              ) : (
                data.areas.map((a, i) => (
                  <tr key={i} className="border-t border-[#2A2D3E] text-slate-200">
                    <td className="px-4 py-2 font-mono">{String(a.postcode_district ?? "—")}</td>
                    <td className="px-4 py-2">{n(a.deal_count) ?? 0}</td>
                    <td className="px-4 py-2">{pct(a.median_btl_gross_yield)}</td>
                    <td className="px-4 py-2">{pct(a.median_hmo_gross_yield)}</td>
                    <td className="px-4 py-2">{String(a.dominant_strategy ?? "—")}</td>
                    <td className="px-4 py-2 capitalize">{String(a.confidence_level ?? "low")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top patterns */}
      <section className="rounded-lg border border-[#2A2D3E] bg-[#1A1D2E]">
        <div className="border-b border-[#2A2D3E] px-4 py-3 text-sm font-semibold text-white">
          Top Patterns Discovered
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="px-4 py-2 font-medium">Pattern</th>
                <th className="px-4 py-2 font-medium">Strategy</th>
                <th className="px-4 py-2 font-medium">Area</th>
                <th className="px-4 py-2 font-medium">Frequency</th>
                <th className="px-4 py-2 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {data.patterns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    No patterns discovered yet.
                  </td>
                </tr>
              ) : (
                data.patterns.map((p, i) => (
                  <tr key={i} className="border-t border-[#2A2D3E] text-slate-200">
                    <td className="px-4 py-2">{String(p.pattern_type ?? "—")}</td>
                    <td className="px-4 py-2">{String(p.strategy ?? "—")}</td>
                    <td className="px-4 py-2 font-mono">{String(p.postcode_area ?? "—")}</td>
                    <td className="px-4 py-2">{n(p.frequency) ?? 0}</td>
                    <td className="px-4 py-2">{(n(p.confidence) ?? 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dual learning loop */}
      <section className="rounded-lg border border-[#2A2D3E] bg-[#1A1D2E]">
        <div className="border-b border-[#2A2D3E] px-4 py-3 text-sm font-semibold text-white">
          How Metalyzi Learns — Dual Loop
        </div>
        <div className="grid grid-cols-1 items-stretch gap-3 p-4 lg:grid-cols-[1fr_auto_1fr]">
          {/* Reactive loop */}
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-300">
              User-Driven Loop · reactive
            </div>
            <ol className="mt-3 space-y-2 text-xs text-slate-300">
              <li>1. A user runs a property analysis</li>
              <li className="text-slate-500">↓</li>
              <li>2. Result recorded to intelligence</li>
              <li className="text-slate-500">↓</li>
              <li>3. Areas · patterns · profiles updated</li>
            </ol>
            <p className="mt-3 text-[11px] text-slate-500">Learns on every analysis, in the moment.</p>
          </div>

          {/* Shared store */}
          <div className="flex flex-col items-center justify-center gap-2 lg:px-2">
            <div className="hidden text-2xl text-slate-600 lg:block">→</div>
            <div className="w-full rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 text-center lg:w-48">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Intelligence Database
              </div>
              <ul className="mt-2 space-y-1 text-[11px] text-slate-300">
                <li>Area intelligence</li>
                <li>Deal patterns</li>
                <li>Platform benchmarks</li>
                <li>Investor profiles</li>
                <li>Rental trend history</li>
              </ul>
            </div>
            <div className="hidden text-2xl text-slate-600 lg:block">←</div>
          </div>

          {/* Proactive loop */}
          <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-300">
              Self-Learning Loop · proactive
            </div>
            <ol className="mt-3 space-y-2 text-xs text-slate-300">
              <li>1. Scheduled agents run on Render cron</li>
              <li className="text-slate-500">↓</li>
              <li>2. Market · planning · rents · macro · feedback</li>
              <li className="text-slate-500">↓</li>
              <li>3. Same intelligence store updated</li>
            </ol>
            <p className="mt-3 text-[11px] text-slate-500">Learns continuously, with no user present.</p>
          </div>
        </div>
        <p className="border-t border-[#2A2D3E] px-4 py-3 text-[11px] leading-relaxed text-slate-500">
          Both loops write to one shared store, which is then injected back into every future analysis — so the
          platform improves whether or not anyone is using it.
        </p>
      </section>

      {/* Self-learning status */}
      <section className="rounded-lg border border-[#2A2D3E] bg-[#1A1D2E]">
        <div className="border-b border-[#2A2D3E] px-4 py-3 text-sm font-semibold text-white">
          Self-Learning Agent Status
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="px-4 py-2 font-medium">Agent</th>
                <th className="px-4 py-2 font-medium">Schedule</th>
                <th className="px-4 py-2 font-medium">Last run</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Items</th>
              </tr>
            </thead>
            <tbody>
              {activity.statuses.map((s, i) => {
                const tone =
                  s.status === "success"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : s.status === "error"
                    ? "bg-rose-500/15 text-rose-300"
                    : "bg-slate-500/15 text-slate-400"
                return (
                  <tr key={i} className="border-t border-[#2A2D3E] text-slate-200">
                    <td className="px-4 py-2 font-medium text-white">{agentLabel(s.name)}</td>
                    <td className="px-4 py-2 text-slate-400">{describeSchedule(s.schedule)}</td>
                    <td className="px-4 py-2 text-slate-400">{timeAgo(s.lastRun)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>
                        {s.status === "pending" ? "not yet run" : s.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">{s.itemsProcessed.toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Signals + recent insights */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <div className="rounded-lg border border-[#2A2D3E] bg-[#1A1D2E]">
          <div className="border-b border-[#2A2D3E] px-4 py-3 text-sm font-semibold text-white">
            Signals Learned
          </div>
          <div className="flex flex-col gap-3 p-4">
            <div className="rounded-md border border-[#2A2D3E] bg-[#13151F] px-3 py-2">
              <div className="text-xs text-slate-400">BoE base rate</div>
              <div className="font-mono text-sm text-white">
                {activity.signals.baseRate === null ? "—" : `${activity.signals.baseRate.toFixed(2)}%`}
              </div>
            </div>
            <div className="rounded-md border border-[#2A2D3E] bg-[#13151F] px-3 py-2">
              <div className="text-xs text-slate-400">Negative feedback (30d)</div>
              <div className="font-mono text-sm text-white">
                {activity.signals.negativeFeedback === null ? "—" : activity.signals.negativeFeedback}
              </div>
            </div>
            <div className="rounded-md border border-[#2A2D3E] bg-[#13151F] px-3 py-2">
              <div className="text-xs text-slate-400">Districts with price-growth reading</div>
              <div className="font-mono text-sm text-white">{activity.signals.growthReadings}</div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[#2A2D3E] bg-[#1A1D2E]">
          <div className="border-b border-[#2A2D3E] px-4 py-3 text-sm font-semibold text-white">
            Recent Agent Insights
          </div>
          <ul className="divide-y divide-[#2A2D3E]">
            {activity.insights.length === 0 ? (
              <li className="px-4 py-6 text-center text-slate-500">
                No agent insights yet — they appear here after the first scheduled runs.
              </li>
            ) : (
              activity.insights.map((ins, i) => (
                <li key={i} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-baseline sm:justify-between">
                  <span className="text-sm text-slate-200">{ins.text}</span>
                  <span className="shrink-0 text-[11px] text-slate-500 sm:ml-4">
                    {agentLabel(ins.agent)} · {timeAgo(ins.at)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      {/* Model sovereignty */}
      <section className="rounded-lg border border-[#2A2D3E] bg-[#1A1D2E] p-4">
        <div className="text-sm font-semibold text-white">Model Sovereignty</div>
        <p className="mt-1 text-xs text-slate-400">
          The intelligence above belongs to Metalyzi and is independent of the model. Switch the model platform-wide by
          changing one environment variable — every analysis uses the new model and all intelligence is preserved.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-[#2A2D3E] bg-[#13151F] px-3 py-2">
            <div className="text-xs text-slate-400">Current provider</div>
            <div className="font-mono text-sm text-white">{provider}</div>
          </div>
          <div className="rounded-md border border-[#2A2D3E] bg-[#13151F] px-3 py-2">
            <div className="text-xs text-slate-400">Current model</div>
            <div className="font-mono text-sm text-white">{model}</div>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          To switch: set <span className="font-mono text-slate-300">AI_PROVIDER</span> /{" "}
          <span className="font-mono text-slate-300">AI_MODEL</span> in the Vercel and Render environments and redeploy
          (e.g. <span className="font-mono text-slate-300">AI_MODEL=claude-opus-4-8</span>). The{" "}
          <span className="font-mono text-slate-300">openai</span> provider is reserved but not yet implemented.
        </p>
      </section>
    </div>
  )
}
