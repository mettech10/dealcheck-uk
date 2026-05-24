/**
 * /admin/users — All users table with search + plan filter +
 * pagination. Client component because the interactivity (search,
 * sort, filter, pagination) is all client-side over a single
 * server-loaded snapshot.
 *
 * The data load itself is a server-side fetch to /api/admin/users
 * (separate file). Keeping that boundary makes the page resumable
 * without re-running the join on every keystroke.
 *
 * Scope deliberately limited:
 *   - Sortable columns: Email / Joined / Last Active
 *   - Search: email contains
 *   - Filter: plan dropdown
 *   - Pagination: client-side, 25 per page
 *
 * Slide-over user detail panel + per-user actions ("Upgrade to Pro")
 * are flagged in the brief but deferred to a follow-up — they need
 * a mutating /api/admin/users/[id] route + Stripe customer sync
 * which is a bigger surface than this stage.
 */

"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Loader2 } from "lucide-react"
import { TierBadge } from "@/components/admin/tier-badge"
import { formatRelativeTime } from "@/lib/admin-format"

interface UserRow {
  id: string
  email: string
  tier: string
  analysesThisMonth: number
  totalAnalyses: number
  joined: string
  lastSignInAt: string | null
}

type SortKey = "email" | "joined" | "lastActive"

const PAGE_SIZE = 25
const PLANS = [
  { id: "all", label: "All Plans" },
  { id: "free", label: "Free" },
  { id: "pay_per_analysis", label: "Pay Per Analysis" },
  { id: "pro", label: "Pro" },
  { id: "enterprise", label: "Enterprise" },
] as const

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [planFilter, setPlanFilter] = useState<string>("all")
  const [sortKey, setSortKey] = useState<SortKey>("joined")
  const [sortDesc, setSortDesc] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/users")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as { users: UserRow[] }
      })
      .then((data) => {
        if (!cancelled) setUsers(data.users)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "load failed")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (planFilter !== "all" && u.tier !== planFilter) return false
      if (q && !u.email.toLowerCase().includes(q)) return false
      return true
    })
  }, [users, search, planFilter])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "email":
          cmp = a.email.localeCompare(b.email)
          break
        case "joined":
          cmp =
            new Date(a.joined).getTime() - new Date(b.joined).getTime()
          break
        case "lastActive":
          cmp =
            new Date(a.lastSignInAt ?? 0).getTime() -
            new Date(b.lastSignInAt ?? 0).getTime()
          break
      }
      return sortDesc ? -cmp : cmp
    })
    return copy
  }, [filtered, sortKey, sortDesc])

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = sorted.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  )

  const headerSort = (key: SortKey) => () => {
    if (sortKey === key) setSortDesc((d) => !d)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
    setPage(1)
  }
  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDesc ? "↓" : "↑") : ""

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Users</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            {loading ? "Loading…" : `${sorted.length} users`}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search by email…"
            className="h-10 w-full rounded-md border border-[#2A2D3E] bg-[#1A1D2E] pl-10 pr-3 text-sm text-white placeholder:text-[#9CA3AF] focus:border-[#00BFA5] focus:outline-none"
          />
        </div>
        <select
          value={planFilter}
          onChange={(e) => {
            setPlanFilter(e.target.value)
            setPage(1)
          }}
          className="h-10 rounded-md border border-[#2A2D3E] bg-[#1A1D2E] px-3 text-sm text-white focus:border-[#00BFA5] focus:outline-none"
        >
          {PLANS.map((p) => (
            <option key={p.id} value={p.id} className="bg-[#1A1D2E]">
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <section className="overflow-hidden rounded-xl border border-[#2A2D3E] bg-[#1A1D2E]">
        {loading ? (
          <div className="flex items-center justify-center gap-3 p-12 text-sm text-[#9CA3AF]">
            <Loader2 className="size-4 animate-spin text-[#00BFA5]" />
            Loading users…
          </div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-[#EF4444]">
            Failed to load users — {error}
          </div>
        ) : pageRows.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#9CA3AF]">
            No users match the current filter.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#1A1D2E]">
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#9CA3AF]">
                <th className="px-6 py-3 font-medium">User</th>
                <th
                  className="cursor-pointer px-3 py-3 font-medium hover:text-white"
                  onClick={headerSort("email")}
                >
                  Email {sortIndicator("email")}
                </th>
                <th className="px-3 py-3 font-medium">Plan</th>
                <th className="px-3 py-3 text-right font-medium">
                  This Month
                </th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th
                  className="cursor-pointer px-3 py-3 font-medium hover:text-white"
                  onClick={headerSort("joined")}
                >
                  Joined {sortIndicator("joined")}
                </th>
                <th
                  className="cursor-pointer px-3 py-3 font-medium hover:text-white"
                  onClick={headerSort("lastActive")}
                >
                  Last Active {sortIndicator("lastActive")}
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((u) => {
                const initial = (u.email || "?").charAt(0).toUpperCase()
                return (
                  <tr
                    key={u.id}
                    className="border-t border-[#2A2D3E]/60 transition-colors hover:bg-[#00BFA5]/5"
                  >
                    <td className="px-6 py-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-[#00BFA5]/15 text-xs font-semibold text-[#00BFA5]">
                        {initial}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-white">{u.email}</td>
                    <td className="px-3 py-3">
                      <TierBadge tier={u.tier} />
                    </td>
                    <td className="px-3 py-3 text-right text-[#9CA3AF]">
                      {u.analysesThisMonth}
                    </td>
                    <td className="px-3 py-3 text-right text-[#9CA3AF]">
                      {u.totalAnalyses}
                    </td>
                    <td className="px-3 py-3 text-[#9CA3AF]">
                      {formatRelativeTime(u.joined)}
                    </td>
                    <td className="px-3 py-3 text-[#9CA3AF]">
                      {u.lastSignInAt ? formatRelativeTime(u.lastSignInAt) : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-[#9CA3AF]">
          <span>
            Page {safePage} of {pageCount}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-[#2A2D3E] px-3 py-1.5 text-xs text-white disabled:opacity-40 hover:enabled:bg-[#00BFA5]/10"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="rounded-md border border-[#2A2D3E] px-3 py-1.5 text-xs text-white disabled:opacity-40 hover:enabled:bg-[#00BFA5]/10"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
