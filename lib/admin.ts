/**
 * Admin allow-list — single source of truth for "is this user an admin?".
 *
 * Identity model (per 2026-05-24 decision):
 *   - Env var `ADMIN_EMAILS` — comma-separated list of email addresses.
 *   - Anything matching that list (case-insensitive, trimmed) is admin.
 *   - Anything else is not. There is no DB flag, no admin table.
 *
 * Why env vars: zero migrations, change in Vercel without a redeploy
 * (a fresh request reads the latest value), and a leaked DB row can't
 * silently grant admin. The trade-off — every admin change is a deploy
 * environment edit, not a self-serve UI — is fine for a 1-5 admin
 * setup. Switch to a profiles.is_admin column if that scale grows.
 *
 * Used by:
 *   - middleware.ts (gates /admin/* routes)
 *   - app/admin/layout.tsx (defence-in-depth server-side check)
 *   - any /api/admin/* route handler that needs to verify the caller
 */

const ADMIN_EMAILS_ENV = "ADMIN_EMAILS"

/** Parse the allow-list once per call. Returns lower-case, trimmed list. */
function adminEmailList(): string[] {
  const raw = process.env[ADMIN_EMAILS_ENV] ?? ""
  if (!raw) return []
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/** Returns true iff the email is on the allow-list. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  return adminEmailList().includes(normalized)
}

/**
 * Server-side guard for API routes / server components. Pair with
 * `createClient` and `auth.getUser()`. Returns the admin email when
 * authorised, or `null` when not (caller decides how to respond —
 * 401, 403, redirect, etc.).
 */
export function adminEmailIfAllowed(
  user: { email?: string | null } | null | undefined,
): string | null {
  const email = user?.email
  if (!email) return null
  return isAdminEmail(email) ? email.toLowerCase() : null
}

/**
 * Diagnostic — surfaced by /admin/system later. Returns true if
 * ADMIN_EMAILS is set at all (not whether the caller is admin).
 */
export function isAdminAllowListConfigured(): boolean {
  return adminEmailList().length > 0
}
