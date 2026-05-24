/**
 * Server-side helpers for writing to admin_error_log and
 * admin_activity_log.
 *
 * Always returns void — these are best-effort writes. The caller's
 * primary work (analyse, payment, save) must NOT fail because the
 * log write failed. Errors are swallowed + console.warn'd.
 *
 * Service-role only. Don't call from client components.
 */

import { createAdminClient } from "@/lib/supabase/admin"

export type ErrorType =
  | "api_error"
  | "scraper_error"
  | "payment_error"
  | "auth_error"
  | "frontend_error"
  | "flask_5xx"
  | "unknown"

export type ActivityType =
  | "signup"
  | "analysis"
  | "payment"
  | "login"
  | "pdf_export"
  | "saved_deal"

interface ErrorLogEntry {
  errorType: ErrorType
  message: string
  stack?: string | null
  userId?: string | null
  endpoint?: string | null
}

interface ActivityLogEntry {
  eventType: ActivityType
  userId?: string | null
  userEmail?: string | null
  metadata?: Record<string, unknown>
  ipAddress?: string | null
}

/** Append one row to admin_error_log. Never throws. */
export async function logAdminError(entry: ErrorLogEntry): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from("admin_error_log").insert({
      error_type: entry.errorType,
      message: entry.message.slice(0, 4000),
      stack: entry.stack ? entry.stack.slice(0, 8000) : null,
      user_id: entry.userId ?? null,
      endpoint: entry.endpoint ?? null,
    })
    if (error) {
      console.warn("[admin-logs] error_log insert failed:", error)
    }
  } catch (e) {
    console.warn("[admin-logs] error_log threw:", e)
  }
}

/** Append one row to admin_activity_log. Never throws. */
export async function logAdminActivity(entry: ActivityLogEntry): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from("admin_activity_log").insert({
      event_type: entry.eventType,
      user_id: entry.userId ?? null,
      user_email: entry.userEmail ?? null,
      metadata: entry.metadata ?? {},
      ip_address: entry.ipAddress ?? null,
    })
    if (error) {
      console.warn("[admin-logs] activity_log insert failed:", error)
    }
  } catch (e) {
    console.warn("[admin-logs] activity_log threw:", e)
  }
}

/** Extract a best-effort client IP from the standard headers. */
export function ipFromRequest(req: Request | { headers: Headers }): string | null {
  const h = (req as Request).headers
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null
  )
}
