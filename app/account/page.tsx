import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Sparkles, CheckCircle2, AlertCircle, CreditCard, Calendar, ExternalLink } from "lucide-react"
import { TIERS_BY_ID, FREE_MONTHLY_CAP, type TierId } from "@/lib/tiers"
import { ManageSubscriptionButton, BuyUpgradeButtons } from "./buttons"

/**
 * /account — user dashboard for plan + usage + payments.
 *
 * Server-rendered (no client state needed beyond the two button
 * islands). Pulls:
 *   - current Supabase user (redirects to /login if not signed in)
 *   - tier + usage state via get_user_tier RPC
 *   - last 5 payments from payment_history
 *
 * Cards rendered:
 *   - Current Plan (tier name, status, monthly cost, next renewal)
 *   - Usage This Month (X/3 free for Free, credit balance for PPA,
 *                       "Unlimited" for Pro/Enterprise)
 *   - Payment History (last 5 rows)
 *   - Manage / Upgrade buttons (uses Stripe Customer Portal for Pro,
 *                                Stripe Checkout for Free/PPA upgrades)
 */

export const dynamic = "force-dynamic"

export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login?redirect=/account")
  }

  const admin = createAdminClient()
  const { data: rpc } = await admin.rpc("get_user_tier", { p_user_id: user.id })
  const row = Array.isArray(rpc) ? rpc[0] : rpc
  const tierId: TierId = (row?.tier as TierId) ?? "free"
  const tier = TIERS_BY_ID[tierId]
  const status = (row?.status as string) ?? "active"
  const freeUsed = (row?.free_analyses_used as number) ?? 0
  const paidCredits = (row?.paid_credits_remaining as number) ?? 0

  // Subscription row for renewal date + Stripe customer id.
  const { data: sub } = await admin
    .from("user_subscriptions")
    .select("current_period_end, cancel_at_period_end, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle()

  const renewalAt = sub?.current_period_end ? new Date(sub.current_period_end) : null
  const cancelAtPeriodEnd = !!sub?.cancel_at_period_end
  const hasStripeCustomer = !!sub?.stripe_customer_id

  // Last 5 payments.
  const { data: payments } = await admin
    .from("payment_history")
    .select("id, created_at, amount_gbp, tier, status, description")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5)

  const isUnlimited = tierId === "pro" || tierId === "enterprise"

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Your Account</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/analyse">Back to Analyser</Link>
        </Button>
      </div>

      {/* ── Current Plan ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                {tier.name}
              </CardTitle>
              <CardDescription>{tier.description}</CardDescription>
            </div>
            <PlanStatusBadge tierId={tierId} status={status} cancelAtPeriodEnd={cancelAtPeriodEnd} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {tier.priceLabel ? (
              <span className="text-3xl font-bold text-foreground">{tier.priceLabel}</span>
            ) : (
              <>
                <span className="text-3xl font-bold text-foreground">£{tier.price}</span>
                <span className="text-sm text-muted-foreground">/{tier.period}</span>
              </>
            )}
          </div>

          {tierId === "pro" && renewalAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="size-4" />
              {cancelAtPeriodEnd ? (
                <>Pro access ends on <strong className="text-foreground">{renewalAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</strong></>
              ) : (
                <>Next renewal on <strong className="text-foreground">{renewalAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</strong></>
              )}
            </div>
          )}

          {status === "past_due" && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <span className="text-foreground">
                Your last payment failed. Update your payment method to keep your Pro access.
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            {tierId === "pro" || hasStripeCustomer ? (
              <ManageSubscriptionButton />
            ) : null}
            {tierId !== "pro" && tierId !== "enterprise" && <BuyUpgradeButtons />}
          </div>
        </CardContent>
      </Card>

      {/* ── Usage this month ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Usage This Month</CardTitle>
          <CardDescription>
            Resets on the 1st of each month
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isUnlimited ? (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-success" />
              <span className="text-foreground">
                <strong>Unlimited</strong> deal analyses with {tier.name}
              </span>
            </div>
          ) : tierId === "pay_per_analysis" ? (
            <UsageRow
              label="Paid analysis credits"
              value={paidCredits.toString()}
              hint={paidCredits > 0 ? `${paidCredits} ready to use` : "Buy another credit to keep analysing"}
            />
          ) : (
            <>
              <UsageRow
                label="Free analyses used"
                value={`${freeUsed} / ${FREE_MONTHLY_CAP}`}
                hint={
                  freeUsed >= FREE_MONTHLY_CAP
                    ? "Free limit reached — upgrade to continue this month"
                    : `${FREE_MONTHLY_CAP - freeUsed} free ${FREE_MONTHLY_CAP - freeUsed === 1 ? "analysis" : "analyses"} left`
                }
              />
              {paidCredits > 0 && (
                <UsageRow
                  label="Pay-Per-Analysis credits"
                  value={paidCredits.toString()}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Payment history ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-4 text-primary" />
            Payment History
          </CardTitle>
          <CardDescription>Last 5 transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {!payments || payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payments yet. When you buy a one-off analysis or subscribe to Pro,
              your transactions appear here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-border/40 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">
                      {p.description ?? p.tier ?? "Payment"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                      {p.tier ? ` · ${TIERS_BY_ID[p.tier as TierId]?.name ?? p.tier}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <span className="font-semibold text-foreground">
                      £{Number(p.amount_gbp ?? 0).toFixed(2)}
                    </span>
                    <PaymentStatusPill status={p.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {hasStripeCustomer && (
            <p className="mt-4 text-xs text-muted-foreground">
              Full invoice PDFs are available in the{" "}
              <span className="inline-flex items-center gap-0.5">
                Stripe billing portal
                <ExternalLink className="size-3" />
              </span>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Inline helpers ─────────────────────────────────────────────────────────

function PlanStatusBadge({
  tierId,
  status,
  cancelAtPeriodEnd,
}: {
  tierId: TierId
  status: string
  cancelAtPeriodEnd: boolean
}) {
  if (cancelAtPeriodEnd && tierId === "pro") {
    return <Pill tone="amber">Cancels at period end</Pill>
  }
  if (status === "past_due") return <Pill tone="amber">Payment failed</Pill>
  if (status === "cancelled") return <Pill tone="muted">Cancelled</Pill>
  if (tierId === "pro" && status === "active") return <Pill tone="green">Active</Pill>
  if (tierId === "pay_per_analysis") return <Pill tone="primary">Pay as you go</Pill>
  return <Pill tone="muted">Free</Pill>
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: "green" | "amber" | "muted" | "primary"
}) {
  const styles: Record<typeof tone, string> = {
    green: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    amber: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    muted: "bg-muted text-muted-foreground border-border",
    primary: "bg-primary/10 text-primary border-primary/30",
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[tone]}`}
    >
      {children}
    </span>
  )
}

function UsageRow({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-2xl font-bold tabular-nums text-foreground">{value}</span>
      </div>
      {hint && <span className="text-xs text-muted-foreground/80">{hint}</span>}
    </div>
  )
}

function PaymentStatusPill({ status }: { status: string | null | undefined }) {
  if (!status) return null
  const tone = status === "succeeded" ? "green" : status === "failed" ? "amber" : "muted"
  return (
    <Pill tone={tone}>
      {status === "succeeded" ? "Paid" : status === "failed" ? "Failed" : status}
    </Pill>
  )
}
