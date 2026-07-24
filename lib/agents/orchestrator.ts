/**
 * Agent orchestrator (Section 7) — the registry the cron route runs against.
 *
 * Each self-learning agent is registered under a stable URL slug. The Render
 * cron services hit POST /api/agents/<slug>, which looks the agent up here and
 * runs it. run() already wraps execute() so a single agent can never crash the
 * platform; the orchestrator just routes the request to the right one and
 * exposes metadata for the intelligence dashboard.
 */
import type { AgentResult, BaseAgent } from "./BaseAgent"
import { MarketPriceAgent } from "./MarketPriceAgent"
import { PlanningMonitorAgent } from "./PlanningMonitorAgent"
import { RentalTrendAgent } from "./RentalTrendAgent"
import { MacroSignalAgent } from "./MacroSignalAgent"
import { SelfReflectionAgent } from "./SelfReflectionAgent"
import { NurtureAgent } from "./NurtureAgent"
import { createAdminClient } from "@/lib/supabase/admin"

/** slug → agent. Slugs are the public cron path (/api/agents/<slug>). */
export const agents = {
  "market-price": new MarketPriceAgent(),
  "planning-monitor": new PlanningMonitorAgent(),
  "rental-trend": new RentalTrendAgent(),
  "macro-signal": new MacroSignalAgent(),
  "self-reflection": new SelfReflectionAgent(),
  "nurture": new NurtureAgent(),
} satisfies Record<string, BaseAgent>

export type AgentSlug = keyof typeof agents

export interface AgentMeta {
  slug: string
  name: string
  schedule: string
}

/** Run a single agent by slug. Returns null if the slug is unknown. */
export async function runAgent(slug: string): Promise<AgentResult | null> {
  const agent = (agents as Record<string, BaseAgent>)[slug]
  if (!agent) return null
  return agent.run()
}

/**
 * Minimum time that must elapse since the last run before an agent is "due".
 * Derived from the cron cadence, sized so a once-a-day dispatcher fires each
 * agent on schedule regardless of the exact minute Vercel's cron lands on:
 *   • daily  → 20h  (runs every daily dispatch)
 *   • weekly → 6.5d (runs on the ~7th daily dispatch)
 *   • monthly→ 28d  (runs on the ~monthly dispatch)
 */
function dueIntervalMs(cron: string): number {
  const f = cron.trim().split(/\s+/)
  const H = 3_600_000
  const DAY = 86_400_000
  if (f.length >= 5 && f[2] !== "*") return 28 * DAY // monthly (day-of-month)
  if (f.length >= 5 && f[4] !== "*") return 6.5 * DAY // weekly (day-of-week)
  return 20 * H // daily or finer
}

function isDue(cron: string, lastRunIso: string | null): boolean {
  if (!lastRunIso) return true // never run → due
  const age = Date.now() - new Date(lastRunIso).getTime()
  return !Number.isFinite(age) || age >= dueIntervalMs(cron)
}

export interface DueRunSummary {
  ran: Array<{ slug: string; name: string; result: AgentResult }>
  skipped: string[]
}

/**
 * Dispatcher — the single entry point a once-a-day cron should call. Reads the
 * latest run per agent from agent_run_log, then runs every agent whose cadence
 * says it's due (or that has never run). Runs due agents in parallel; run()
 * never throws, so one failing agent can't block the rest.
 */
export async function runDueAgents(): Promise<DueRunSummary> {
  // Latest run timestamp per agent (agent_run_log.agent stores the class name).
  const latest = new Map<string, string>()
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("agent_run_log")
      .select("agent, run_at")
      .order("run_at", { ascending: false })
      .limit(200)
    for (const r of (data ?? []) as Array<{ agent?: unknown; run_at?: unknown }>) {
      const a = String(r.agent ?? "")
      if (a && !latest.has(a)) latest.set(a, String(r.run_at ?? ""))
    }
  } catch (err) {
    // No log / DB hiccup → treat everything as due (never-run) rather than
    // silently skipping. Better to run than to stall the whole platform.
    console.warn("[orchestrator] agent_run_log read failed:", err)
  }

  const due: Array<[string, BaseAgent]> = []
  const skipped: string[] = []
  for (const [slug, agent] of Object.entries(agents) as Array<[string, BaseAgent]>) {
    if (isDue(agent.schedule, latest.get(agent.name) ?? null)) due.push([slug, agent])
    else skipped.push(slug)
  }

  const settled = await Promise.allSettled(due.map(([, agent]) => agent.run()))
  const ran = due.map(([slug, agent], i) => {
    const s = settled[i]
    const result: AgentResult =
      s.status === "fulfilled"
        ? s.value
        : { insights: [], error: String(s.reason), itemsProcessed: 0 }
    return { slug, name: agent.name, result }
  })

  return { ran, skipped }
}

/** Registered agents + their schedules (for the dashboard / cron docs). */
export function listAgents(): AgentMeta[] {
  return Object.entries(agents).map(([slug, a]) => ({
    slug,
    name: a.name,
    schedule: a.schedule,
  }))
}
