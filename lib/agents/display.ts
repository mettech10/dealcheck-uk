/**
 * Shared display helpers for the self-learning agents — one source of truth
 * for human labels, schedule descriptions, and the staleness window used by
 * the intelligence dashboard and the admin agent monitor.
 */

export type AgentHealth = "healthy" | "failing" | "stale" | "pending"

/** "MarketPriceAgent" → "Market Price". */
export function agentLabel(name: string): string {
  return name
    .replace(/Agent$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
}

/** Plain-English cron schedule. */
export function describeSchedule(cron: string): string {
  const map: Record<string, string> = {
    "0 3 1 * *": "Monthly · 1st · 03:00",
    "0 4 1 * *": "Monthly · 1st · 04:00",
    "0 6 * * 1": "Weekly · Mon · 06:00",
    "0 8 * * *": "Daily · 08:00",
    "0 2 * * 0": "Weekly · Sun · 02:00",
  }
  return map[cron] ?? cron
}

/**
 * Max age (ms) before a run is considered overdue, derived from the cron
 * cadence: a fixed day-of-month → monthly, a fixed day-of-week → weekly,
 * otherwise daily. A grace margin is baked into each window.
 */
export function expectedMaxAgeMs(cron: string): number {
  const f = cron.trim().split(/\s+/)
  const DAY = 86_400_000
  if (f.length >= 5 && f[2] !== "*") return 32 * DAY // monthly
  if (f.length >= 5 && f[4] !== "*") return 8 * DAY // weekly
  return 2 * DAY // daily or finer
}

/** Classify an agent from its most recent run. */
export function agentHealth(
  lastStatus: "success" | "error" | null,
  lastRunIso: string | null,
  schedule: string,
): AgentHealth {
  if (!lastRunIso || !lastStatus) return "pending"
  if (lastStatus === "error") return "failing"
  const age = Date.now() - new Date(lastRunIso).getTime()
  if (Number.isFinite(age) && age > expectedMaxAgeMs(schedule)) return "stale"
  return "healthy"
}
