/**
 * GET /api/admin/agents/status
 *
 * Live health of the self-learning agents, for the admin monitor. Admin-gated.
 * Joins the orchestrator registry (every agent + its schedule) against the
 * latest rows in agent_run_log so agents that have never run still appear as
 * "pending". Also returns the most recent insights and errors across all
 * agents. Read-only and cheap — safe to poll.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminEmail } from "@/lib/admin"
import { listAgents } from "@/lib/agents/orchestrator"
import { agentLabel, describeSchedule, agentHealth, type AgentHealth } from "@/lib/agents/display"

export const dynamic = "force-dynamic"

type Row = Record<string, unknown>

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 })
  }

  const registered = listAgents()
  const admin = createAdminClient()

  let logs: Row[] = []
  try {
    const { data } = await admin
      .from("agent_run_log")
      .select("agent, status, items_processed, insights, errors, duration_ms, run_at")
      .order("run_at", { ascending: false })
      .limit(300)
    logs = (data as Row[]) ?? []
  } catch {
    logs = []
  }

  // Latest run per agent name.
  const latest = new Map<string, Row>()
  for (const r of logs) {
    const a = String(r.agent ?? "")
    if (a && !latest.has(a)) latest.set(a, r)
  }

  const agents = registered.map((a) => {
    const last = latest.get(a.name)
    const lastStatus = last ? (String(last.status ?? "") as "success" | "error") : null
    const lastRun = last ? String(last.run_at ?? "") || null : null
    const errs = last && Array.isArray(last.errors) ? (last.errors as unknown[]) : []
    return {
      slug: a.slug,
      name: a.name,
      label: agentLabel(a.name),
      schedule: a.schedule,
      scheduleLabel: describeSchedule(a.schedule),
      lastRun,
      lastStatus,
      itemsProcessed: last ? num(last.items_processed) ?? 0 : 0,
      durationMs: last ? num(last.duration_ms) : null,
      lastError: errs.length ? String(errs[0]) : null,
      health: agentHealth(lastStatus, lastRun, a.schedule),
    }
  })

  const summary = agents.reduce(
    (acc, a) => {
      acc.total++
      acc[a.health]++
      return acc
    },
    { total: 0, healthy: 0, failing: 0, stale: 0, pending: 0 } as Record<AgentHealth | "total", number>,
  )

  // Most recent insights + errors across every agent (newest first).
  const recentInsights: { agent: string; label: string; text: string; at: string }[] = []
  const recentErrors: { agent: string; label: string; text: string; at: string }[] = []
  for (const r of logs) {
    const agent = String(r.agent ?? "")
    const at = String(r.run_at ?? "")
    if (recentInsights.length < 12 && Array.isArray(r.insights)) {
      for (const t of r.insights as unknown[]) {
        if (String(t).trim() && recentInsights.length < 12)
          recentInsights.push({ agent, label: agentLabel(agent), text: String(t), at })
      }
    }
    if (recentErrors.length < 8 && Array.isArray(r.errors)) {
      for (const t of r.errors as unknown[]) {
        if (String(t).trim() && recentErrors.length < 8)
          recentErrors.push({ agent, label: agentLabel(agent), text: String(t), at })
      }
    }
  }

  return NextResponse.json({
    agents,
    summary,
    recentInsights,
    recentErrors,
    generatedAt: new Date().toISOString(),
  })
}
