/**
 * POST /api/admin/log-activity
 *
 * Public endpoint — the frontend posts events that have no clean
 * server-side trigger (e.g. PDF export = window.print, fired in the
 * browser; saved-deal binding via consume-credit is already
 * instrumented server-side).
 *
 * The caller can choose any event_type from a fixed allow-list so a
 * runaway client can't flood the table with bogus categories. The
 * route looks up the signed-in user (best effort) and stamps user_id
 * + user_email automatically — the body only carries metadata.
 *
 * Not admin-gated; the activity log is meant to record what real
 * users do, not just what admins do. Service-role write happens
 * server-side so the table is never exposed to the browser.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  logAdminActivity,
  ipFromRequest,
  type ActivityType,
} from "@/lib/admin-logs"

export const dynamic = "force-dynamic"

interface LogActivityBody {
  eventType?: string
  metadata?: Record<string, unknown>
}

const ALLOWED: Set<ActivityType> = new Set([
  "signup",
  "analysis",
  "payment",
  "login",
  "pdf_export",
  "saved_deal",
])

export async function POST(req: Request) {
  let body: LogActivityBody = {}
  try {
    body = (await req.json()) as LogActivityBody
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const eventType = body.eventType as ActivityType | undefined
  if (!eventType || !ALLOWED.has(eventType)) {
    return NextResponse.json(
      { error: "eventType must be one of " + Array.from(ALLOWED).join(", ") },
      { status: 400 },
    )
  }

  // Best-effort auth identity lookup. Anonymous events still write.
  let userId: string | null = null
  let userEmail: string | null = null
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userId = user?.id ?? null
    userEmail = user?.email ?? null
  } catch {
    /* ignore */
  }

  await logAdminActivity({
    eventType,
    userId,
    userEmail,
    metadata: body.metadata ?? {},
    ipAddress: ipFromRequest(req),
  })

  return NextResponse.json({ ok: true })
}
