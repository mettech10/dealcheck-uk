"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Menu,
  X,
  User,
  LogOut,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { signOut } from "@/app/auth/actions"
import { CreditsPill } from "@/components/landing/credits-pill"
import { ThemeToggle } from "@/components/theme-toggle"

interface NavbarProps {
  user?: { email?: string; name?: string } | null
}

interface ToolItem {
  href: string
  name: string
}

// Plain-text only — no icons, no descriptions, no badges.
const TOOLS: ToolItem[] = [
  { href: "/tools/sdlt-calculator", name: "SDLT Calculator" },
  { href: "/tools/portfolio",       name: "Portfolio Tracker" },
  { href: "/tools/compare",         name: "Deal Comparison" },
]

/** Map raw tier id from /api/usage to a friendly label + badge tone. */
function tierMeta(tier: string | null): { label: string; tone: "teal" | "muted" | "amber" } {
  switch (tier) {
    case "pro":              return { label: "Pro",              tone: "teal" }
    case "enterprise":       return { label: "Enterprise",       tone: "teal" }
    case "pay_per_analysis": return { label: "Pay Per Analysis", tone: "amber" }
    case "free":
    default:                 return { label: "Free",             tone: "muted" }
  }
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname()
  const isToolsActive = pathname?.startsWith("/tools") ?? false

  // ── Mobile main menu ──
  const [mobileOpen, setMobileOpen] = useState(false)
  // ── Mobile Tools sub-menu (in-place expand) ──
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)

  // ── Desktop Tools dropdown ──
  const [toolsOpen, setToolsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Desktop Account popover (replaces standalone Account link) ──
  const [accountOpen, setAccountOpen] = useState(false)
  const [tierId, setTierId] = useState<string | null>(null)
  const [tierLoading, setTierLoading] = useState(false)
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null)
  const accountPopoverRef = useRef<HTMLDivElement | null>(null)

  // Fetch tier the first time the popover opens (cached after).
  useEffect(() => {
    if (!accountOpen || !user || tierId !== null) return
    setTierLoading(true)
    fetch("/api/usage")
      .then((r) => r.json())
      .then((j) => setTierId(j.tier ?? "free"))
      .catch(() => setTierId("free"))
      .finally(() => setTierLoading(false))
  }, [accountOpen, user, tierId])

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setToolsOpen(false), 150)
  }

  // Click-outside close (Tools + Account popover)
  useEffect(() => {
    if (!toolsOpen && !accountOpen) return
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        toolsOpen &&
        triggerRef.current && !triggerRef.current.contains(t) &&
        dropdownRef.current && !dropdownRef.current.contains(t)
      ) {
        setToolsOpen(false)
      }
      if (
        accountOpen &&
        accountTriggerRef.current && !accountTriggerRef.current.contains(t) &&
        accountPopoverRef.current && !accountPopoverRef.current.contains(t)
      ) {
        setAccountOpen(false)
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [toolsOpen, accountOpen])

  // Escape closes both desktop dropdowns
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setToolsOpen(false)
        setAccountOpen(false)
      }
    }
    document.addEventListener("keydown", onEscape)
    return () => document.removeEventListener("keydown", onEscape)
  }, [])

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          {/* Navy logo in light mode, original teal logo in dark mode */}
          <Image
            src="/logo-navy.png"
            alt="Metalyzi Logo"
            width={32}
            height={32}
            className="rounded-lg object-contain dark:hidden"
          />
          <Image
            src="/logo.png"
            alt="Metalyzi Logo"
            width={32}
            height={32}
            className="hidden rounded-lg object-contain dark:block"
          />
          <span className="text-lg font-semibold tracking-tight text-foreground">
            Metalyzi
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-8 md:flex">
          <a
            href="/#features"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </a>
          <a
            href="/#how-it-works"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            How It Works
          </a>
          <a
            href="/#pricing"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </a>

          {/* ── Tools dropdown ─────────────────────────────────── */}
          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setToolsOpen((v) => !v)}
              onMouseEnter={() => { cancelClose(); setToolsOpen(true) }}
              onMouseLeave={scheduleClose}
              aria-expanded={toolsOpen}
              aria-haspopup="menu"
              className={`flex items-center gap-1 py-2 text-sm transition-colors hover:text-foreground ${
                isToolsActive || toolsOpen ? "text-primary font-semibold" : "text-muted-foreground"
              }`}
            >
              Tools
              <ChevronDown
                className={`size-3.5 transition-transform duration-200 ${
                  toolsOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {toolsOpen && (
              <div
                ref={dropdownRef}
                role="menu"
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
                className="absolute left-1/2 top-full z-[1000] mt-2 w-[220px] -translate-x-1/2 animate-tools-dropdown rounded-xl border border-border/60 bg-background p-2 shadow-2xl"
              >
                {/* Triangle pointer */}
                <div
                  aria-hidden
                  className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-l border-t border-border/60 bg-background"
                />
                {TOOLS.map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    role="menuitem"
                    onClick={() => setToolsOpen(false)}
                    className="block rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/60"
                  >
                    {t.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Account link removed — the user pill on the right is now
              the entry point for account / billing via a popover.    */}
        </div>

        {/* Desktop auth area */}
        <div className="hidden items-center gap-3 md:flex">
          {/* Theme toggle — sits to the left of the account / login control */}
          <ThemeToggle />
          {user ? (
            <>
              <Button asChild size="default">
                <Link href="/analyse">Analyse a Deal</Link>
              </Button>

              {/* ── Credits pill ────────────────────────────────────
                  Always-visible balance / Pro / free counter.
                  Fetches /api/user/credits on mount; renders
                  nothing while loading so the row doesn't shift. */}
              <CreditsPill />

              {/* ── User pill → Account popover ────────────────────── */}
              <div className="relative">
                <button
                  ref={accountTriggerRef}
                  type="button"
                  onClick={() => setAccountOpen((v) => !v)}
                  aria-expanded={accountOpen}
                  aria-haspopup="dialog"
                  className={`flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 transition-colors hover:border-primary/60 ${
                    accountOpen ? "border-primary/60" : "border-border/50"
                  }`}
                >
                  <div className="flex size-6 items-center justify-center rounded-full bg-primary/20">
                    <User className="size-3 text-primary" />
                  </div>
                  <span className="max-w-[120px] truncate text-xs text-muted-foreground">
                    {user.name || user.email}
                  </span>
                </button>

                {accountOpen && (
                  <AccountPopover
                    popoverRef={accountPopoverRef}
                    user={user}
                    tierId={tierId}
                    tierLoading={tierLoading}
                    onClose={() => setAccountOpen(false)}
                  />
                )}
              </div>

              <form action={signOut}>
                <Button variant="ghost" size="sm" type="submit">
                  <LogOut className="size-3.5" />
                  <span className="sr-only">Sign out</span>
                </Button>
              </form>
            </>
          ) : (
            <Button asChild size="default" variant="outline">
              <Link href="/login">
                <User className="size-4" />
                Log In / Sign Up
              </Link>
            </Button>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="text-foreground md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border/50 bg-background px-6 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            {/* Theme toggle at the top of the mobile menu */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Appearance</span>
              <ThemeToggle />
            </div>
            <a
              href="/#features"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              Features
            </a>
            <a
              href="/#how-it-works"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              How It Works
            </a>
            <a
              href="/#pricing"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              Pricing
            </a>

            {/* ── Tools expandable section ─────────────────────── */}
            <div>
              <button
                type="button"
                onClick={() => setMobileToolsOpen((v) => !v)}
                aria-expanded={mobileToolsOpen}
                className={`flex w-full items-center justify-between py-1 text-sm transition-colors hover:text-foreground ${
                  isToolsActive ? "text-primary font-semibold" : "text-muted-foreground"
                }`}
              >
                <span>Tools</span>
                <ChevronRight
                  className={`size-4 transition-transform duration-200 ${
                    mobileToolsOpen ? "rotate-90" : ""
                  }`}
                />
              </button>
              {mobileToolsOpen && (
                <div className="mt-2 flex flex-col border-l border-border/40 pl-4">
                  {TOOLS.map((t) => (
                    <Link
                      key={t.href}
                      href={t.href}
                      onClick={() => {
                        setMobileToolsOpen(false)
                        setMobileOpen(false)
                      }}
                      className="rounded-md py-2 text-sm text-foreground/85 transition-colors hover:text-foreground"
                    >
                      {t.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Mobile Account link removed; identity + tier shown in
                the auth block below alongside the sign-out button. */}

            {user ? (
              <>
                <MobileAccountCard user={user} />
                <Button
                  asChild
                  size="default"
                  className="w-full"
                  onClick={() => setMobileOpen(false)}
                >
                  <Link href="/analyse">Analyse a Deal</Link>
                </Button>
                <form action={signOut}>
                  <Button
                    variant="outline"
                    size="default"
                    className="w-full"
                    type="submit"
                  >
                    <LogOut className="size-4" />
                    Sign Out
                  </Button>
                </form>
              </>
            ) : (
              <Button
                asChild
                size="default"
                variant="outline"
                className="w-full"
              >
                <Link href="/login">
                  <User className="size-4" />
                  Log In / Sign Up
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

// ── Desktop Account popover ──────────────────────────────────────────

function AccountPopover({
  popoverRef,
  user,
  tierId,
  tierLoading,
  onClose,
}: {
  popoverRef: React.RefObject<HTMLDivElement | null>
  user: { email?: string; name?: string }
  tierId: string | null
  tierLoading: boolean
  onClose: () => void
}) {
  const tier = tierMeta(tierId)
  const toneClass: Record<typeof tier.tone, string> = {
    teal:  "border-primary/30 bg-primary/10 text-primary",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    muted: "border-border/50 bg-muted/40 text-muted-foreground",
  }
  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Account"
      className="absolute right-0 top-full z-[1000] mt-2 w-[280px] animate-tools-account-pop rounded-xl border border-border/60 bg-background p-4 shadow-2xl"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/15">
          <User className="size-4 text-primary" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">
            {user.name || user.email?.split("@")[0] || "Signed in"}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {user.email}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg border border-border/40 bg-card/40 px-3 py-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Plan
        </span>
        {tierLoading && tierId === null ? (
          <span className="text-xs text-muted-foreground">Loading…</span>
        ) : (
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneClass[tier.tone]}`}
          >
            {tier.label}
          </span>
        )}
      </div>

      <Link
        href="/account"
        onClick={onClose}
        className="mt-3 block rounded-md border border-border/40 bg-background/60 px-3 py-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        Manage Account
      </Link>
    </div>
  )
}

// ── Mobile Account card (inline in the hamburger menu) ───────────────

function MobileAccountCard({
  user,
}: {
  user: { email?: string; name?: string }
}) {
  const [tierId, setTierId] = useState<string | null>(null)
  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((j) => setTierId(j.tier ?? "free"))
      .catch(() => setTierId("free"))
  }, [])
  const tier = tierMeta(tierId)
  const toneClass: Record<typeof tier.tone, string> = {
    teal:  "border-primary/30 bg-primary/10 text-primary",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    muted: "border-border/50 bg-muted/40 text-muted-foreground",
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-sm">
        <User className="size-3.5 text-primary" />
        <span className="truncate text-foreground">
          {user.name || user.email}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Plan</span>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${toneClass[tier.tone]}`}
        >
          {tier.label}
        </span>
      </div>
      <Link
        href="/account"
        className="text-center text-xs text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
      >
        Manage Account
      </Link>
    </div>
  )
}
