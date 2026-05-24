/**
 * Credits card — prominent balance display at the top of /account.
 *
 * Three visual states (all share the same shell):
 *   - Pro / Enterprise → teal "Unlimited" badge + period-end date
 *   - PPA credits > 0   → big teal number + "credit(s) remaining"
 *   - Free, 0 credits   → amber "0 credits" + buy CTAs
 *
 * Pure server component — props are pre-loaded by /account/page.tsx
 * via the get_user_credit_state RPC. The two action buttons reuse
 * the existing BuyUpgradeButtons client island.
 */

import { Sparkles, Zap, AlertCircle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { BuyUpgradeButtons } from "@/app/account/buttons"

interface CreditsCardProps {
  isUnlimited: boolean
  unlimitedUntil: Date | null
  creditBalance: number
  totalPurchased: number
  totalUsed: number
  tierLabel: string
}

export function CreditsCard({
  isUnlimited,
  unlimitedUntil,
  creditBalance,
  totalPurchased,
  totalUsed,
  tierLabel,
}: CreditsCardProps) {
  return (
    <Card
      id="credits"
      className="overflow-hidden border-primary/30 bg-card scroll-mt-20"
    >
      <CardContent className="flex flex-col gap-5 p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/15">
              <Zap className="size-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Analysis Credits
              </h2>
              <p className="text-xs text-muted-foreground">{tierLabel}</p>
            </div>
          </div>
        </div>

        {/* Big number / unlimited badge */}
        {isUnlimited ? (
          <div className="flex flex-col gap-1">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">
              <Sparkles className="size-3.5" />
              PRO — Unlimited
            </div>
            {unlimitedUntil && (
              <p className="text-xs text-muted-foreground">
                Active until{" "}
                <span className="font-medium text-foreground">
                  {unlimitedUntil.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </p>
            )}
          </div>
        ) : creditBalance > 0 ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-5xl font-bold text-primary">
              {creditBalance}
            </span>
            <span className="text-sm text-muted-foreground">
              credit{creditBalance === 1 ? "" : "s"} remaining · never expires
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-5xl font-bold text-amber-500">0</span>
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-sm text-amber-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <span>
                No credits yet. Buy a one-off analysis or go Pro for
                unlimited.
              </span>
            </div>
          </div>
        )}

        {/* Totals — show on all states so the user sees their history
            at a glance. Zero values still render so the layout is
            predictable. */}
        <div className="grid grid-cols-2 gap-3 border-t border-border/40 pt-4 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total purchased
            </p>
            <p className="mt-0.5 text-base font-semibold text-foreground">
              {totalPurchased}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total used
            </p>
            <p className="mt-0.5 text-base font-semibold text-foreground">
              {totalUsed}
            </p>
          </div>
        </div>

        {/* CTAs — only when NOT unlimited (Pro already covers everything). */}
        {!isUnlimited && (
          <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
            <BuyUpgradeButtons />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
