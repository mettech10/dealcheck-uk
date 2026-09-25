"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  formatCreditsLabel,
  isNavItemActive,
  visiblePrimaryNav,
  SECONDARY_NAV,
  type AppNavItem,
  type CreditLabelInput,
} from "@/lib/app-nav"
import {
  CREDITS_REFRESH_EVENT,
  type CreditsRefreshDetail,
} from "@/components/landing/credits-pill"

function RailDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full bg-current",
        active ? "opacity-100 shadow-[0_0_0_3px] shadow-primary/20" : "opacity-[0.55]",
      )}
    />
  )
}

function RailLink({
  item,
  pathname,
  onNavigate,
  muted,
}: {
  item: AppNavItem
  pathname: string
  onNavigate?: () => void
  muted?: boolean
}) {
  const active = isNavItemActive(pathname, item)
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "mb-0.5 flex items-center gap-2.5 rounded-[7px] border px-2.5 py-[9px] text-[13px] font-medium transition-colors",
        active
          ? "border-primary/25 bg-primary/10 text-primary"
          : cn(
              "border-transparent hover:bg-foreground/[0.04] hover:text-foreground",
              muted ? "text-muted-foreground/80" : "text-muted-foreground",
            ),
      )}
    >
      <RailDot active={active} />
      {item.label}
    </Link>
  )
}

function RailCredits() {
  const [state, setState] = useState<CreditLabelInput | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    fetch("/api/user/credits")
      .then((r) => (r.ok ? (r.json() as Promise<CreditLabelInput>) : null))
      .then((data) => {
        if (!cancelled) setState(data)
      })
      .catch(() => {
        if (!cancelled) setState(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => load(), [load])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<CreditsRefreshDetail>).detail
      if (detail && typeof detail.newCreditBalance === "number") {
        setState((prev) =>
          prev ? { ...prev, creditBalance: detail.newCreditBalance ?? prev.creditBalance } : prev,
        )
        return
      }
      load()
    }
    window.addEventListener(CREDITS_REFRESH_EVENT, handler)
    return () => window.removeEventListener(CREDITS_REFRESH_EVENT, handler)
  }, [load])

  const label = formatCreditsLabel(state)
  if (!label) return null

  return (
    <Link
      href="/account#credits"
      className="mb-2 flex items-center justify-between rounded-[7px] border border-border bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground dark:border-[#1c222b] dark:bg-[#0e1218]"
    >
      <span>Credits</span>
      <strong className="font-semibold tabular-nums text-primary">{label}</strong>
    </Link>
  )
}

export function AppRail({
  onNavigate,
  onClose,
}: {
  onNavigate?: () => void
  onClose?: () => void
}) {
  const pathname = usePathname() ?? ""
  const primary = visiblePrimaryNav()

  return (
    <div
      data-app-rail
      className="flex h-full min-h-0 w-full flex-col bg-sidebar text-sidebar-foreground dark:bg-[#06090f]"
    >
      <div className="flex items-center gap-2 border-b border-sidebar-border px-4 pb-3.5 pt-[18px] dark:border-[#1c222b]">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <Image
            src="/logo-navy.png"
            alt="Metalyzi"
            width={28}
            height={28}
            className="size-7 rounded-lg object-contain dark:hidden"
          />
          <Image
            src="/logo.png"
            alt=""
            width={28}
            height={28}
            className="hidden size-7 rounded-lg object-contain dark:block"
          />
          <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            Metalyzi
          </span>
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tools menu"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <nav aria-label="Platform tools" className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
        <div className="px-2.5 pb-1.5 pt-2 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground/80">
          Platform
        </div>
        {primary.map((item) => (
          <RailLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}

        <div className="mt-3 px-2.5 pb-1.5 pt-2 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground/70">
          More
        </div>
        {SECONDARY_NAV.map((item) => (
          <RailLink
            key={item.href}
            item={item}
            pathname={pathname}
            onNavigate={onNavigate}
            muted
          />
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-3.5 pb-4 pt-3 text-xs text-muted-foreground dark:border-[#1c222b]">
        <RailCredits />
        <div>UK landlords · deal sourcers</div>
      </div>
    </div>
  )
}
