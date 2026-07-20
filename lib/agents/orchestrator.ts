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

/** Registered agents + their schedules (for the dashboard / cron docs). */
export function listAgents(): AgentMeta[] {
  return Object.entries(agents).map(([slug, a]) => ({
    slug,
    name: a.name,
    schedule: a.schedule,
  }))
}
