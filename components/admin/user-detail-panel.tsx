"use client"

/**
 * User detail slide-over — opens from the Users table when an admin
 * clicks the eye/View action. Fetches /api/admin/users/[id] on
 * mount.
 *
 * Layout: fixed full-height panel sliding in from the right.
 *   - Header: avatar + email + joined date
 *   - Subscription block (current tier + status + Stripe ids)
 *   - Tier action buttons (Free / PPA / Pro / Enterprise) — PATCH
 *     /api/admin/users/[id]. Active tier is highlighted, others
 *     clickable.
 *   - Saved analyses (last 20)
 *   - Payment history (full)
 *   - Monthly usage (last 6 periods)
 *
 * No optimistic update on tier change — we wait for the PATCH then
 * refetch so anything else affected (e.g. paid_credits_remaining)
 * shows the latest state.
 */

import { useCallback, useEffect, useState } from "react"
import { Loader2, X } from "lucide-react"
import { TierBadge } from "@/components/admin/tier-badge"
import { formatGbp, formatRelativeTime } from "@/lib/admin-format"

interface UserDetail {
  user: {
    id: string
    email: string | null
    created_at: string
    last_sign_in_at: string | null
    user_metadata: Record<string, unknown>
  }
  subscription: {
    tier: string
    status: string
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    current_period_end: string | null
    cancel_at_period_end: boolean
  } | null
  usage: Array<{
    period_start: string
    free_analyses_used: number
    paid_analysis_credits: number
    total_analyses_this_period: number
  }>
  payments: Array<{
    id: string
    created_at: string
    amount_gbp: number | null
    tier: string | null
    status: string | null
  }>
  savedAnalyses: Array<{
    id: string
    address: string | null
    investment_type: string | null
    purchase_price: number | null
    created_at: string
  }>
}

const TIER_OPTIONS = [
  { id: "free", label: "Free" },
  { id: "pay_per_analysis", label: "PPA" },
  { id: "pro", label: "Pro" },
  { id: "enterprise", label: "Enterprise" },
] as const

interface Props {
  userId: string
  onClose: () => void
}

export function UserDetailPanel({ userId, onClose }: Props) {
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mutating, setMutating] = useState<string | null>(null)
  // Grant-credit form state, kept local since it's a one-shot
  // mutation that doesn't need to live in the parent detail object.
  const [grantAmount, setGrantAmount] = useState<string>("1")
  const [grantNotes, setGrantNotes] = useState<string>("")
  const [grantStatus, setGrantStatus] = useState<
    null | { ok: true; balance: number } | { ok: false; error: string }
  >(null)
  const [granting, setGranting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/admin/users/${userId}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setDetail((await r.json()) as UserDetail)
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed")
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  const setTier = async (tier: string) => {
    setMutating(tier)
    try {
      const r = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "tier update failed")
    } finally {
      setMutating(null)
    }
  }

  const currentTier = detail?.subscription?.tier ?? "free"
  const initial =
    (detail?.user.email ?? "?").charAt(0).toUpperCase() ||
    userId.charAt(0).toUpperCase()

  // Current balance: sum of paid_analysis_credits on the current
  // month's usage row. Cheap derivation from already-loaded data
  // so we don't need a separate fetch.
  const currentMonth = new Date().toISOString().slice(0, 7)
  const currentBalance = (detail?.usage ?? [])
    .filter((u) => u.period_start.startsWith(currentMonth))
    .reduce((s, u) => s + (u.paid_analysis_credits ?? 0), 0)

  const grantCredits = async (delta: number, reason?: string) => {
    setGranting(true)
    setGrantStatus(null)
    try {
      const r = await fetch("/api/admin/credits/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          amount: delta,
          notes: reason ?? grantNotes ?? null,
        }),
      })
      const data = (await r.json().catch(() => ({}))) as {
        ok?: boolean
        newBalance?: number
        error?: string
      }
      if (!r.ok || !data.ok) {
        setGrantStatus({
          ok: false,
          error: data.error || `HTTP ${r.status}`,
        })
      } else {
        setGrantStatus({ ok: true, balance: data.newBalance ?? 0 })
        await load()
      }
    } catch (e) {
      setGrantStatus({
        ok: false,
        error: e instanceof Error ? e.message : "network error",
      })
    } finally {
      setGranting(false)
    }
  }

  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-y-auto border-l border-[#2A2D3E] bg-[#1A1D2E] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#2A2D3E] bg-[#1A1D2E] px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#00BFA5]/15 text-sm font-semibold text-[#00BFA5]">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {detail?.user.email ?? "Loading…"}
              </p>
              {detail && (
                <p className="text-[11px] text-[#9CA3AF]">
                  Joined {formatRelativeTime(detail.user.created_at)}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#9CA3AF] hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-6 px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#9CA3AF]">
              <Loader2 className="size-4 animate-spin text-[#00BFA5]" />
              Loading…
            </div>
          ) : error ? (
            <div className="rounded-md border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-sm text-[#EF4444]">
              {error}
            </div>
          ) : detail ? (
            <>
              {/* Subscription */}
              <section className="flex flex-col gap-3 rounded-lg border border-[#2A2D3E] bg-black/20 p-4">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  Subscription
                </h3>
                <div className="flex items-center gap-2">
                  <TierBadge tier={currentTier} />
                  <span className="text-xs text-[#9CA3AF]">
                    {detail.subscription?.status ?? "no subscription row"}
                  </span>
                </div>
                {detail.subscription?.stripe_customer_id && (
                  <p className="font-mono text-[10px] text-[#9CA3AF]">
                    Customer: {detail.subscription.stripe_customer_id}
                  </p>
                )}
                {detail.subscription?.current_period_end && (
                  <p className="text-[11px] text-[#9CA3AF]">
                    Period ends {formatRelativeTime(detail.subscription.current_period_end)}
                    {detail.subscription.cancel_at_period_end ? " · cancelling" : ""}
                  </p>
                )}
              </section>

              {/* ── Manage credits ────────────────────────────────── */}
              <section className="flex flex-col gap-3 rounded-lg border border-[#2A2D3E] bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                      Manage Credits
                    </h3>
                    <p className="mt-1 text-xs text-white">
                      Current balance:{" "}
                      <span className="font-semibold text-[#00BFA5]">
                        {currentBalance} credit{currentBalance === 1 ? "" : "s"}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[#9CA3AF]">
                    Amount
                    <input
                      type="number"
                      step={1}
                      value={grantAmount}
                      onChange={(e) => setGrantAmount(e.target.value)}
                      disabled={granting}
                      className="h-9 w-24 rounded-md border border-[#2A2D3E] bg-[#1A1D2E] px-2 text-sm text-white focus:border-[#00BFA5] focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1 text-[10px] uppercase tracking-wider text-[#9CA3AF]">
                    Reason (optional)
                    <input
                      type="text"
                      value={grantNotes}
                      onChange={(e) => setGrantNotes(e.target.value)}
                      disabled={granting}
                      placeholder="e.g. support ticket #123"
                      className="h-9 rounded-md border border-[#2A2D3E] bg-[#1A1D2E] px-2 text-sm text-white placeholder:text-[#9CA3AF]/60 focus:border-[#00BFA5] focus:outline-none"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={
                      granting ||
                      !Number.isFinite(Number(grantAmount)) ||
                      Number(grantAmount) === 0
                    }
                    onClick={() => grantCredits(Number(grantAmount))}
                    className="rounded-md border border-[#00BFA5]/40 bg-[#00BFA5]/10 px-3 py-1.5 text-xs font-medium text-[#00BFA5] transition-colors hover:bg-[#00BFA5]/20 disabled:opacity-40"
                  >
                    {granting ? "Working…" : "+ Add credits"}
                  </button>
                  <button
                    type="button"
                    disabled={granting || currentBalance === 0}
                    onClick={() => {
                      if (
                        confirm(
                          "Reset this user's credit balance to 0? This logs an admin grant of " +
                            -currentBalance +
                            " — undo by adding the same amount back.",
                        )
                      ) {
                        grantCredits(-currentBalance, "Reset to 0 by admin")
                      }
                    }}
                    className="rounded-md border border-[#EF4444]/30 px-3 py-1.5 text-xs text-[#EF4444] transition-colors hover:bg-[#EF4444]/10 disabled:opacity-40"
                  >
                    Reset to 0
                  </button>
                </div>

                {grantStatus &&
                  (grantStatus.ok ? (
                    <p className="text-xs text-[#10B981]">
                      ✓ New balance: {grantStatus.balance} credit
                      {grantStatus.balance === 1 ? "" : "s"}. User has been
                      emailed.
                    </p>
                  ) : (
                    <p className="text-xs text-[#EF4444]">
                      ✗ {grantStatus.error}
                    </p>
                  ))}

                <p className="text-[10px] text-[#9CA3AF]">
                  Logged in payment_history as admin_grant with your id +
                  the reason note. User is emailed automatically on
                  positive amounts.
                </p>
              </section>

              {/* Tier actions */}
              <section className="flex flex-col gap-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  Change Tier
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {TIER_OPTIONS.map((opt) => {
                    const active = opt.id === currentTier
                    const busy = mutating === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={active || mutating !== null}
                        onClick={() => setTier(opt.id)}
                        className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                          active
                            ? "border-[#00BFA5] bg-[#00BFA5]/10 text-[#00BFA5]"
                            : "border-[#2A2D3E] text-white hover:bg-[#00BFA5]/10 hover:text-[#00BFA5]"
                        }`}
                      >
                        {busy
                          ? "…"
                          : active
                            ? `Current · ${opt.label}`
                            : opt.label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] text-[#9CA3AF]">
                  Local override only — does not sync to Stripe. Use for
                  test promotions, refund-revokes, and Enterprise grants.
                </p>
              </section>

              {/* Saved analyses */}
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  Saved Analyses ({detail.savedAnalyses.length})
                </h3>
                {detail.savedAnalyses.length === 0 ? (
                  <p className="text-xs text-[#9CA3AF]">None.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-[#2A2D3E]/60">
                    {detail.savedAnalyses.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-white">
                            {a.address ?? "(unknown address)"}
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">
                            {a.investment_type ?? "?"} ·{" "}
                            {formatGbp(a.purchase_price)}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] text-[#9CA3AF]">
                          {formatRelativeTime(a.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Payments */}
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  Payments ({detail.payments.length})
                </h3>
                {detail.payments.length === 0 ? (
                  <p className="text-xs text-[#9CA3AF]">None.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-[#2A2D3E]/60">
                    {detail.payments.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="text-white">
                            {formatGbp(p.amount_gbp)}
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">
                            {p.tier ?? "—"} · {p.status ?? "—"}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] text-[#9CA3AF]">
                          {formatRelativeTime(p.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Usage */}
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  Monthly Usage (last 6)
                </h3>
                {detail.usage.length === 0 ? (
                  <p className="text-xs text-[#9CA3AF]">No usage rows.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-[#2A2D3E]/60">
                    {detail.usage.slice(0, 6).map((u) => (
                      <li
                        key={u.period_start}
                        className="flex items-center justify-between gap-3 py-2 text-xs"
                      >
                        <span className="text-white">{u.period_start}</span>
                        <span className="text-[#9CA3AF]">
                          {u.total_analyses_this_period} analyses ·{" "}
                          {u.paid_analysis_credits} credits left
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </>
  )
}
