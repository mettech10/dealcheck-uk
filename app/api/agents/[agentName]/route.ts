/**
 * Self-learning agent runner — POST/GET /api/agents/<slug>
 *
 * Triggered by the Render cron services (see metusa-deal-analyzer/render.yaml),
 * which send `Authorization: Bearer ${CRON_SECRET}`. We reject anything else so
 * the endpoint can't be run from the public internet.
 *
 * Why we AWAIT the agent (vs the spec's fire-and-forget): Vercel serverless
 * functions are frozen once the response is sent, so any work kicked off after
 * responding would be killed. We run the agent within the request and return
 * its summary. BaseAgent.run() never throws, so a failing agent still returns
 * 200 with an error field rather than taking the platform down.
 */
import { NextResponse } from "next/server"
import { runAgent, agents } from "@/lib/agents/orchestrator"

export const runtime = "nodejs"
export const maxDuration = 300 // agents can fan out across many districts/sites
export const dynamic = "force-dynamic"

function authorised(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return true // no secret configured → allow (e.g. local dev)
  return (req.headers.get("authorization") ?? "") === `Bearer ${expected}`
}

async function handle(req: Request, agentName: string): Promise<NextResponse> {
  if (!authorised(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (!(agentName in agents)) {
    return NextResponse.json(
      { error: "unknown agent", known: Object.keys(agents) },
      { status: 404 },
    )
  }

  try {
    const result = await runAgent(agentName)
    return NextResponse.json({ agent: agentName, ...result }, { status: 200 })
  } catch (err) {
    // run() shouldn't throw, but never let the route 500 the cron either.
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[api/agents/${agentName}] unexpected:`, err)
    return NextResponse.json({ agent: agentName, error: detail }, { status: 200 })
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ agentName: string }> }) {
  const { agentName } = await ctx.params
  return handle(req, agentName)
}

// GET supported too, so a Vercel cron (or a manual curl) can trigger a run.
export async function GET(req: Request, ctx: { params: Promise<{ agentName: string }> }) {
  const { agentName } = await ctx.params
  return handle(req, agentName)
}
