/**
 * Dependency-free registry of the self-learning + discovery agents — metadata
 * only (slug, name, schedule).
 *
 * Importing this NEVER pulls in the agent implementations, and therefore never
 * the discovery pipeline (Rightmove scraper, tier1/tier2 analysis), the AI
 * gateway, the PropertyData cache, or Brevo. That keeps read-only surfaces —
 * the admin intelligence dashboard and the monitor's status route —
 * lightweight and, crucially, unable to crash at module-init time from
 * anything in the agent runtime. (The orchestrator, which actually RUNS agents,
 * imports all of that; a failure there must not take the dashboard down.)
 *
 * Keep this list in sync with the `agents` map in ./orchestrator.ts — same
 * slugs, names, and schedules.
 */
export interface AgentMeta {
  slug: string
  name: string
  schedule: string
}

export const AGENT_REGISTRY: AgentMeta[] = [
  { slug: "market-price", name: "MarketPriceAgent", schedule: "0 3 1 * *" },
  { slug: "planning-monitor", name: "PlanningMonitorAgent", schedule: "0 6 * * 1" },
  { slug: "rental-trend", name: "RentalTrendAgent", schedule: "0 4 1 * *" },
  { slug: "macro-signal", name: "MacroSignalAgent", schedule: "0 8 * * *" },
  { slug: "self-reflection", name: "SelfReflectionAgent", schedule: "0 2 * * 0" },
  { slug: "nurture", name: "NurtureAgent", schedule: "0 10 * * *" },
  { slug: "discovery", name: "DiscoveryAgent", schedule: "0 7 * * *" },
]

/** Registered agents + schedules, for dashboards / cron docs. No runtime deps. */
export function listAgents(): AgentMeta[] {
  return AGENT_REGISTRY
}
