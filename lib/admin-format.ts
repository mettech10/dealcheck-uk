/**
 * Shared formatters for admin dashboard tables.
 *
 * Intentionally plain functions (not a class / no dependencies) so
 * server and client components can both use them without bundling
 * concerns. All formatters are timezone-naive — they read the
 * caller's date strings as ISO and present in the browser's locale.
 */

/**
 * "2 minutes ago" / "3 hours ago" / "5 days ago". Falls back to a
 * locale date string for anything older than 30 days.
 */
export function formatRelativeTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso
  const diffMs = Date.now() - date.getTime()
  if (Number.isNaN(diffMs)) return "—"
  if (diffMs < 0) return "just now"

  const sec = Math.floor(diffMs / 1000)
  if (sec < 30) return "just now"
  if (sec < 60) return `${sec}s ago`

  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`

  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`

  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/** Compact GBP — £1,234.56 */
export function formatGbp(amount: number | null | undefined): string {
  if (amount == null) return "—"
  return `£${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
