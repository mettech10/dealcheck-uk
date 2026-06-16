/**
 * POST /api/admin/agents/run  { agent: "<slug>" }
 *
 * Manually trigger a self-learning agent from the admin monitor. Admin-gated
 * (so it does NOT need the cron secret the scheduled route requires). Runs the
 * agent inline and returns its result; the run is also recorded in
 * agent_run_log by BaseAgent, so the monitor reflects it on the next poll.
 *
 * Scraping agents can take a few minutes — maxDuration is set high and the
 * client shows a running state while it waits.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isAdminEmail } from "@/lib/admin"
import { runAgent, agents } from "@/lib/agents/orchestrator"

export const runtime = "nodejs"
export const maxDuration = 300
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 })
  }

  let slug = ""
  try {
    const body = (await req.json()) as { agent?: string }
    slug = String(body.agent ?? "")
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 })
  }

  if (!(slug in agents)) {
    return NextResponse.json({ error: "unknown agent", known: Object.keys(agents) }, { status: 404 })
  }

  try {
    const result = await runAgent(slug)
    return NextResponse.json({ agent: slug, ...result }, { status: 200 })
  } catch (err) {
    // run() shouldn't throw, but never 500 the monitor.
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ agent: slug, error: detail }, { status: 200 })
  }
}
