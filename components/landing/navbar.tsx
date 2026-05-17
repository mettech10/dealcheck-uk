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

  // Click-outside close
  useEffect(() => {
    if (!toolsOpen) return
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        dropdownRef.current && !dropdownRef.current.contains(t)
      ) {
        setToolsOpen(false)
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [toolsOpen])

  // Escape closes both desktop dropdown + mobile sub-menu
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setToolsOpen(false)
      }
    }
    document.addEventListener("keydown", onEscape)
    return () => document.removeEventListener("keydown", onEscape)
  }, [])

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Metalyzi Logo"
            width={32}
            height={32}
            className="rounded-lg object-contain"
          />
          <span className="text-lg font-semibold tracking-tight text-foreground">
            Metalyzi
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-8 md:flex">
          <a
            href="#features"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            How It Works
          </a>
          <a
            href="#pricing"
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

          <Link
            href="/account"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Account
          </Link>
        </div>

        {/* Desktop auth area */}
        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <Button asChild size="default">
                <Link href="/analyse">Analyse a Deal</Link>
              </Button>
              <div className="flex items-center gap-2 rounded-md border border-border/50 bg-card px-3 py-1.5">
                <div className="flex size-6 items-center justify-center rounded-full bg-primary/20">
                  <User className="size-3 text-primary" />
                </div>
                <span className="max-w-[120px] truncate text-xs text-muted-foreground">
                  {user.name || user.email}
                </span>
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
            <a
              href="#features"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              How It Works
            </a>
            <a
              href="#pricing"
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

            <Link
              href="/account"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              Account
            </Link>

            {user ? (
              <>
                <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
                  <User className="size-3.5" />
                  <span className="truncate">
                    {user.name || user.email}
                  </span>
                </div>
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
