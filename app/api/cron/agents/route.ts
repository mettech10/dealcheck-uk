/**
 * Self-learning agent dispatcher — GET/POST /api/cron/agents
 *
 * The ONE endpoint a daily cron should hit. It runs whichever agents are due
 * (per their cadence), instead of needing a separate cron per agent. This
 * keeps us within Vercel's cron-job limit and means new agents auto-schedule
 * just by being registered in the orchestrator.
 *
 * Trigger: the daily Vercel cron in vercel.json. Vercel automatically sends
 * `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set, which we
 * verify. Any external scheduler (Render cron / cron-job.org) can call this
 * too with the same header.
 */
import { NextResponse } from "next/server"
import { runDueAgents } from "@/lib/agents/orchestrator"

export const runtime = "nodejs"
export const maxDuration = 300 // agents fan out across many districts/sites
export const dynamic = "force-dynamic"

function authorised(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return true // no secret configured → allow (e.g. local dev)
  return (req.headers.get("authorization") ?? "") === `Bearer ${expected}`
}

async function handle(req: Request): Promise<NextResponse> {
  if (!authorised(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    const summary = await runDueAgents()
    return NextResponse.json(
      {
        ok: true,
        ranCount: summary.ran.length,
        ran: summary.ran.map((r) => ({
          slug: r.slug,
          items: r.result.itemsProcessed,
          insights: r.result.insights.length,
          error: r.result.error ?? null,
        })),
        skipped: summary.skipped,
      },
      { status: 200 },
    )
  } catch (err) {
    // runDueAgents shouldn't throw, but never let the route 500 the cron.
    const detail = err instanceof Error ? err.message : String(err)
    console.error("[api/cron/agents] unexpected:", err)
    return NextResponse.json({ ok: false, error: detail }, { status: 200 })
  }
}

export async function GET(req: Request) {
  return handle(req)
}

export async function POST(req: Request) {
  return handle(req)
}
