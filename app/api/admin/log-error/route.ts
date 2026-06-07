/**
 * POST /api/admin/log-error
 *
 * Public endpoint — any frontend can report a JS exception here.
 * Inserts into admin_error_log with error_type='frontend_error'.
 *
 * Deliberately not admin-gated: the whole point is to capture errors
 * from anonymous browsers + free users. Service-role write happens
 * server-side, never exposing the table to the client.
 *
 * Light validation only — caller-supplied strings are length-capped
 * inside logAdminError(). No rate limiting yet; revisit if abuse
 * shows up in the table.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logAdminError } from "@/lib/admin-logs"

export const dynamic = "force-dynamic"

interface LogErrorBody {
  message?: string
  stack?: string
  endpoint?: string
  errorType?: string
}

const ALLOWED_TYPES = new Set([
  "api_error",
  "scraper_error",
  "payment_error",
  "auth_error",
  "frontend_error",
  "flask_5xx",
  "unknown",
])

export async function POST(req: Request) {
  let body: LogErrorBody = {}
  try {
    body = (await req.json()) as LogErrorBody
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  if (!body.message || typeof body.message !== "string") {
    return NextResponse.json({ error: "message required" }, { status: 400 })
  }

  // Best-effort: attach the user id when the request carries an auth
  // session. Anonymous reports still write — user_id stays null.
  let userId: string | null = null
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userId = user?.id ?? null
  } catch {
    /* ignore */
  }

  const errorType = ALLOWED_TYPES.has(body.errorType ?? "")
    ? (body.errorType as Parameters<typeof logAdminError>[0]["errorType"])
    : "frontend_error"

  await logAdminError({
    errorType,
    message: body.message,
    stack: body.stack ?? null,
    endpoint: body.endpoint ?? null,
    userId,
  })

  return NextResponse.json({ ok: true })
}
