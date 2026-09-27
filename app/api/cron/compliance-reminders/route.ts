/**
 * Vercel Cron endpoint — daily compliance reminder emails.
 *
 * Triggered by vercel.json at "0 7 * * *" (07:00 UTC, 8am UK in summer;
 * Hobby plans fire anywhere in that hour). Calls Flask
 * POST /v1/compliance/reminders/dispatch, which emails due T-90..overdue
 * reminders via Brevo and queues weekly overdue follow-ups. Dispatch is
 * idempotent, so a repeat call never double-sends.
 *
 * `?dryRun=1` checks the wiring (auth + due list) without sending anything.
 *
 * Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET
 * is set in project env vars, matching the other cron routes.
 */

import { NextResponse } from "next/server"
import { runComplianceReminderDispatch } from "@/lib/compliance/reminderCron"

export const runtime = "nodejs"
export const maxDuration = 300
export const dynamic = "force-dynamic"

async function handle(req: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET
  if (expected) {
    const header = req.headers.get("authorization") ?? ""
    if (header !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
  }
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1"
  const result = await runComplianceReminderDispatch({ dryRun })
  if (result.status !== 200) {
    console.error("[cron/compliance-reminders]", result.body)
  }
  return NextResponse.json(result.body, { status: result.status })
}

export async function GET(req: Request) {
  return handle(req)
}

export async function POST(req: Request) {
  return handle(req)
}
